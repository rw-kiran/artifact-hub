import { mcpServer } from '@/lib/mcp/server'
import { createServerSupabaseClient } from '@/lib/db/supabase'

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function isAuthorized(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false
  // Local dev / admin fallback
  if (process.env.MCP_API_KEY && token === process.env.MCP_API_KEY) return true
  // Per-user key: hash and look up
  const hash = await sha256(token)
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('mcp_api_keys')
    .select('id')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .single()
  if (data) {
    supabase.from('mcp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
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
