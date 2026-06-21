import { timingSafeEqual } from 'node:crypto'
import { mcpServer } from '@/lib/mcp/server'
import { mcpContext } from '@/lib/mcp/context'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import { sha256 } from '@/lib/crypto'

const ONE_HOUR_MS = 60 * 60 * 1000

async function resolveAuth(req: Request): Promise<{ ok: boolean; userId: string | null }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { ok: false, userId: null }

  // Local dev / admin fallback — timing-safe comparison, no user association
  if (process.env.MCP_API_KEY) {
    const a = Buffer.from(token)
    const b = Buffer.from(process.env.MCP_API_KEY)
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, userId: null }
  }

  // Per-user key: hash, look up, and return the owning user_id
  const hash = await sha256(token)
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('mcp_api_keys')
    .select('id, user_id, last_used_at')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .single()

  if (!data) return { ok: false, userId: null }

  // Throttle: only write if last used over an hour ago (or never)
  const stale = !data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > ONE_HOUR_MS
  if (stale) {
    await supabase.from('mcp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  }

  return { ok: true, userId: data.user_id }
}

const unauthorized = () =>
  Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

export async function POST(req: Request) {
  const { ok, userId } = await resolveAuth(req)
  if (!ok) return unauthorized()
  return mcpContext.run({ userId }, () => mcpServer.fetch(req))
}

export async function GET(req: Request) {
  const { ok, userId } = await resolveAuth(req)
  if (!ok) return unauthorized()
  return mcpContext.run({ userId }, () => mcpServer.fetch(req))
}

export async function DELETE(req: Request) {
  const { ok, userId } = await resolveAuth(req)
  if (!ok) return unauthorized()
  return mcpContext.run({ userId }, () => mcpServer.fetch(req))
}
