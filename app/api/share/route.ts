import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { ShareCreateSchema } from '@/lib/validation'

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

  const result = ShareCreateSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { artifact_id, expires_in_hours } = result.data
  const supabase = createServerSupabaseClient()

  const { data: artifact } = await supabase
    .from('artifacts')
    .select('id, created_by')
    .eq('id', artifact_id)
    .single()

  if (!artifact) {
    return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  if (artifact.created_by !== user.id) {
    return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  const expires_at = new Date(Date.now() + expires_in_hours * 3_600_000).toISOString()

  const { data: tokenRow, error } = await supabase
    .from('share_tokens')
    .insert({ artifact_id, expires_at })
    .select()
    .single()

  if (error) {
    console.error(JSON.stringify({ event: 'share_token_create_error', error: error.message }))
    return Response.json({ error: 'Failed to create share token', code: 'DB_ERROR' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return Response.json({
    url: `${appUrl}/share/${tokenRow.token}`,
    token: tokenRow.token,
    expires_at: tokenRow.expires_at,
    id: tokenRow.id,
  }, { status: 201 })
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const artifact_id = searchParams.get('artifact_id')
  if (!artifact_id) {
    return Response.json({ error: 'artifact_id required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: artifact } = await supabase
    .from('artifacts')
    .select('created_by')
    .eq('id', artifact_id)
    .single()

  if (!artifact || artifact.created_by !== user.id) {
    return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data: tokens, error } = await supabase
    .from('share_tokens')
    .select('*')
    .eq('artifact_id', artifact_id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: 'Failed to fetch tokens', code: 'DB_ERROR' }, { status: 500 })
  }

  return Response.json({ tokens: tokens ?? [] })
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const token_id = searchParams.get('token_id')
  if (!token_id) {
    return Response.json({ error: 'token_id required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: tokenRow } = await supabase
    .from('share_tokens')
    .select('id, artifact_id, artifacts!inner(created_by)')
    .eq('id', token_id)
    .single()

  if (!tokenRow) {
    return Response.json({ error: 'Token not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const created_by = (tokenRow.artifacts as unknown as { created_by: string }).created_by
  if (created_by !== user.id) {
    return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { error } = await supabase.from('share_tokens').delete().eq('id', token_id)
  if (error) {
    return Response.json({ error: 'Failed to delete token', code: 'DB_ERROR' }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
