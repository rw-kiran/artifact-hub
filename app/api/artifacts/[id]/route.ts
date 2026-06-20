import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { cookies } from 'next/headers'
import { z } from 'zod'

const PatchArtifactSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  feedback_summary: z.string().max(2000).optional(),
})

async function getOwner(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const { data: { user } } = await createAuthClient({
    getAll: () => cookieStore.getAll(),
    set: () => {},
  }).auth.getUser()
  return user
}

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
    const user = await getOwner(cookieStore)
    if (!user || user.id !== data.created_by) {
      return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
    }
  }

  return Response.json({ artifact: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const user = await getOwner(cookieStore)
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const result = PatchArtifactSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  if (Object.keys(result.data).length === 0) {
    return Response.json({ error: 'No fields to update', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: existing } = await supabase.from('artifacts').select('created_by').eq('id', id).single()
  if (!existing) {
    return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  if (existing.created_by !== user.id) {
    return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('artifacts')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(JSON.stringify({ event: 'artifact_update_error', error: error.message }))
    return Response.json({ error: 'Failed to update artifact', code: 'DB_ERROR' }, { status: 500 })
  }

  return Response.json({ artifact: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const user = await getOwner(cookieStore)
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: existing } = await supabase.from('artifacts').select('created_by').eq('id', id).single()
  if (!existing) {
    return Response.json({ error: 'Artifact not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  if (existing.created_by !== user.id) {
    return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { error } = await supabase.from('artifacts').delete().eq('id', id)
  if (error) {
    console.error(JSON.stringify({ event: 'artifact_delete_error', error: error.message }))
    return Response.json({ error: 'Failed to delete artifact', code: 'DB_ERROR' }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
