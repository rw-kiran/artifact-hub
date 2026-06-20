import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data: existing } = await supabase
    .from('mcp_api_keys')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .single()

  if (!existing) return Response.json({ error: 'Key not found', code: 'NOT_FOUND' }, { status: 404 })

  const { error } = await supabase
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return Response.json({ error: 'Failed to revoke key', code: 'DB_ERROR' }, { status: 500 })
  return new Response(null, { status: 204 })
}
