import { cookies } from 'next/headers'
import { after } from 'next/server'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { CreateArtifactSchema } from '@/lib/validation'
import { generateMetadataFromText } from '@/lib/ai/claude'
import { extractContent } from '@/lib/ai/extract'
import { ingestArtifact } from '@/lib/ai/ingest'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const type = searchParams.get('type')
  const tag = searchParams.get('tag')
  const q = searchParams.get('q')

  const supabase = createServerSupabaseClient()
  const from = (page - 1) * 20

  const GALLERY_COLS = 'id, title, description, tags, type, blob_url, creator_name, created_at, visibility, index_status'
  let query = supabase
    .from('artifacts')
    .select(GALLERY_COLS)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, from + 19)

  if (type && ['html', 'image', 'pdf'].includes(type)) query = query.eq('type', type)
  if (tag) query = query.contains('tags', [tag])
  if (q) {
    // Strip PostgREST filter metacharacters to prevent filter injection
    const safe = q.replace(/[(),]/g, '')
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error(JSON.stringify({ event: 'artifacts_list_error', error: error.message }))
    return Response.json({ error: 'Failed to fetch artifacts', code: 'DB_ERROR' }, { status: 500 })
  }

  return Response.json({ artifacts: data ?? [], page, hasMore: (data ?? []).length === 20 })
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const result = CreateArtifactSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      ...result.data,
      title: result.data.title ?? 'Untitled',
      created_by: user.id,
      creator_email: user.email,
      creator_name: (user.user_metadata?.full_name as string | undefined) ?? user.email,
    })
    .select()
    .single()

  if (error) {
    console.error(JSON.stringify({ event: 'artifact_create_error', error: error.message }))
    return Response.json({ error: 'Failed to create artifact', code: 'DB_ERROR' }, { status: 500 })
  }

  // Fire-and-forget after response: extract once, then metadata + RAG ingest in parallel
  after(async () => {
    const text = await extractContent(data.blob_url, data.type as 'html' | 'image' | 'pdf').catch(() => '')
    await Promise.allSettled([
      generateMetadataFromText(text, data.type)
        .then(meta => createServerSupabaseClient().from('artifacts').update(meta).eq('id', data.id))
        .catch(err => console.error(JSON.stringify({ event: 'metadata_error', artifactId: data.id, error: String(err) }))),
      ingestArtifact(data.id, data.blob_url, data.type as 'html' | 'image' | 'pdf', text),
    ])
  })

  return Response.json({ artifact: data }, { status: 201 })
}
