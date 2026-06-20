import { mcpServer } from '@/lib/mcp/server'

function isAuthorized(req: Request) {
  return req.headers.get('authorization') === `Bearer ${process.env.MCP_API_KEY}`
}

const unauthorized = () =>
  Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}

export async function DELETE(req: Request) {
  if (!isAuthorized(req)) return unauthorized()
  return mcpServer.fetch(req)
}
