import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mcp/server', () => ({
  mcpServer: { fetch: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })) },
}))

const mockSingle = vi.fn()
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ is: () => ({ single: mockSingle }) }) }),
      update: mockUpdate,
    }),
  }),
}))

import { POST, GET, DELETE } from '@/app/api/mcp/route'

const OLD_ENV = process.env

beforeEach(() => {
  process.env = { ...OLD_ENV, MCP_API_KEY: 'test-secret' }
  mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
  mockUpdate.mockClear()
  mockUpdateEq.mockClear()
})

describe('MCP route auth', () => {
  it('rejects POST without Authorization header', async () => {
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('rejects POST with wrong token (not in env or DB)', async () => {
    process.env = { ...OLD_ENV, MCP_API_KEY: undefined }
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('passes POST to mcpServer when env key matches', async () => {
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('passes GET to mcpServer when authorized', async () => {
    const res = await GET(
      new Request('http://localhost/api/mcp', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('rejects DELETE without token', async () => {
    const res = await DELETE(new Request('http://localhost/api/mcp', { method: 'DELETE' }))
    expect(res.status).toBe(401)
  })

  it('passes with valid DB key when no env key', async () => {
    process.env = { ...OLD_ENV, MCP_API_KEY: undefined }
    mockSingle.mockResolvedValue({ data: { id: 'key-1', last_used_at: null }, error: null })
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer ahub_validdbkey' },
      }),
    )
    expect(res.status).toBe(200)
  })
})

describe('last_used_at throttle', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, MCP_API_KEY: undefined }
  })

  it('updates last_used_at when key has never been used', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'key-1', last_used_at: null }, error: null })
    await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer ahub_validdbkey' },
      }),
    )
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('updates last_used_at when used over 1 hour ago', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    mockSingle.mockResolvedValue({ data: { id: 'key-1', last_used_at: twoHoursAgo }, error: null })
    await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer ahub_validdbkey' },
      }),
    )
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('skips last_used_at update when used within the last hour', async () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockSingle.mockResolvedValue({ data: { id: 'key-1', last_used_at: thirtyMinsAgo }, error: null })
    await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer ahub_validdbkey' },
      }),
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
