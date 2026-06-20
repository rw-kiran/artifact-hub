import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import { CreateArtifactSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const type = searchParams.get('type')
  const tag = searchParams.get('tag')
  const q = searchParams.get('q')

  const supabase = createServerSupabaseClient()
  const from = (page - 1) * 20

  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, from + 19)

  if (type && ['html', 'image', 'pdf'].includes(type)) query = query.eq('type', type)
  if (tag) query = query.contains('tags', [tag])
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)

  const { data, error } = await query

  if (error) {
    console.error(JSON.stringify({ event: 'artifacts_list_error', error: error.message }))
    return Response.json({ error: 'Failed to fetch artifacts', code: 'DB_ERROR' }, { status: 500 })
  }

  return Response.json({ artifacts: data ?? [], page, hasMore: (data ?? []).length === 20 })
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await authClient.auth.getUser()
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

  return Response.json({ artifact: data }, { status: 201 })
}
