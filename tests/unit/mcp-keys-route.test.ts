import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
const mockEq = vi.fn().mockReturnValue({ is: mockIs })
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: () => ({ from: () => ({ select: mockSelect }) }),
  createAuthClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]) }),
}))

import { GET } from '@/app/api/mcp-keys/route'

beforeEach(() => {
  mockSelect.mockClear()
  mockEq.mockClear()
  mockIs.mockClear()
  mockOrder.mockClear()
  mockOrder.mockResolvedValue({ data: [], error: null })
})

describe('GET /api/mcp-keys', () => {
  it('does not include key_raw in the select query', async () => {
    await GET()
    expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('key_raw'))
  })

  it('returns 200 with a keys array', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('keys')
    expect(Array.isArray(body.keys)).toBe(true)
  })

  it('returns keys without key_raw field', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: '1', name: 'Test', key_prefix: 'ahub_abc', created_at: '2024-01-01', last_used_at: null }],
      error: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.keys[0]).not.toHaveProperty('key_raw')
  })

  it('returns 500 on DB error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } })
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})
