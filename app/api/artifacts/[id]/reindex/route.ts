import { cookies } from 'next/headers'
import { after } from 'next/server'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { ingestArtifact } from '@/lib/ai/ingest'
import type { ArtifactType } from '@/lib/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: artifact } = await supabase
    .from('artifacts')
    .select('id, blob_url, type, created_by')
    .eq('id', id)
    .single()

  if (!artifact) {
    return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  if (artifact.created_by !== user.id) {
    return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  await supabase.from('artifacts').update({ index_status: 'pending' }).eq('id', id)

  after(async () => {
    await ingestArtifact(id, artifact.blob_url, artifact.type as ArtifactType)
  })

  return Response.json({ status: 'reindexing' })
}
