import { timingSafeEqual } from 'node:crypto'
import { mcpServer } from '@/lib/mcp/server'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import { sha256 } from '@/lib/crypto'

const ONE_HOUR_MS = 60 * 60 * 1000

async function isAuthorized(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false

  // Local dev / admin fallback — timing-safe comparison
  if (process.env.MCP_API_KEY) {
    const a = Buffer.from(token)
    const b = Buffer.from(process.env.MCP_API_KEY)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }

  // Per-user key: hash and look up
  const hash = await sha256(token)
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('mcp_api_keys')
    .select('id, last_used_at')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .single()

  if (data) {
    // Throttle: only write if last used over an hour ago (or never)
    const stale = !data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > ONE_HOUR_MS
    if (stale) {
      await supabase.from('mcp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    }
  }
  return !!data
}

const unauthorized = () =>
  Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

export async function POST(req: Request) {
  if (!await isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}

export async function GET(req: Request) {
  if (!await isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}

export async function DELETE(req: Request) {
  if (!await isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}
