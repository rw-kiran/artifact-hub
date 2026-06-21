import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { AddFeedbackSchema } from '@/lib/validation'
import { summarizeFeedback } from '@/lib/ai/claude'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const parsed = AddFeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient({
    getAll: () => cookieStore.getAll(),
    set: () => {},
  }).auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data: artifact } = await supabase
    .from('artifacts')
    .select('id, visibility, created_by')
    .eq('id', parsed.data.artifact_id)
    .single()

  if (!artifact) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  if (artifact.visibility === 'private' && artifact.created_by !== user.id) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      artifact_id: parsed.data.artifact_id,
      content: parsed.data.content,
      rating: parsed.data.rating ?? null,
      author_email: user.email!,
      author_name: user.user_metadata?.full_name ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to save feedback', code: 'DB_ERROR' }, { status: 500 })
  }

  after(async () => { await summarizeFeedback(parsed.data.artifact_id) })

  return NextResponse.json({ feedback: data }, { status: 201 })
}
