import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { z } from 'zod'

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateKey() {
  const raw = `ahub_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  return { raw, prefix: raw.slice(0, 12) }
}

const CreateKeySchema = z.object({ name: z.string().min(1).max(100).default('My Key') })

export async function GET() {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select('id, name, key_prefix, created_at, last_used_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to list keys', code: 'DB_ERROR' }, { status: 500 })
  return Response.json({ keys: data })
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { body = {} }

  const result = CreateKeySchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.message, code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { raw, prefix } = generateKey()
  const hash = await sha256(raw)

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .insert({ user_id: user.id, name: result.data.name, key_prefix: prefix, key_hash: hash })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) return Response.json({ error: 'Failed to create key', code: 'DB_ERROR' }, { status: 500 })
  return Response.json({ key: raw, meta: data }, { status: 201 })
}
