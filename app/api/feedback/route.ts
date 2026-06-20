import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { AddFeedbackSchema } from '@/lib/validation'

export async function POST(request: Request) {
  const body = await request.json()
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

  return NextResponse.json({ feedback: data }, { status: 201 })
}
