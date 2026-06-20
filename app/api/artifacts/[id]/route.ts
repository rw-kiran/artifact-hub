import { createServerSupabaseClient } from '@/lib/db/supabase'

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

  // ponytail: private visibility check omitted; Phase 2 adds auth guard for private artifacts
  return Response.json({ artifact: data })
}
