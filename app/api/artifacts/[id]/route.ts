import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { cookies } from 'next/headers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  if (data.visibility === 'private') {
    const cookieStore = await cookies()
    const { data: { user } } = await createAuthClient({
      getAll: () => cookieStore.getAll(),
      set: () => {},
    }).auth.getUser()
    if (!user || user.id !== data.created_by) {
      return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
    }
  }

  return Response.json({ artifact: data })
}
