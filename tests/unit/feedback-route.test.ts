import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/server', () => ({ after: vi.fn(), NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }))
vi.mock('@/lib/ai/claude', () => ({ summarizeFeedback: vi.fn().mockResolvedValue(null) }))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/db/supabase')

import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { POST } from '@/app/api/feedback/route'

const VALID_UUID = '00000000-0000-0000-0000-000000000001'
const OWNER_ID = 'user-owner'
const OTHER_ID = 'user-other'

const mockUser = { id: OWNER_ID, email: 'owner@example.com', user_metadata: { full_name: 'Owner' } }

const mockArtifact = { id: VALID_UUID, visibility: 'public', created_by: OWNER_ID }

const mockFeedback = {
  id: 'fb-1',
  artifact_id: VALID_UUID,
  author_email: 'owner@example.com',
  author_name: 'Owner',
  content: 'Great artifact, really enjoyed it!',
  rating: 4,
  created_at: '2026-01-01T00:00:00Z',
}

const validBody = {
  artifact_id: VALID_UUID,
  content: 'Great artifact, really enjoyed it!',
  rating: 4,
}

// Proxy chain: all methods return self; .single() returns the provided result
function makeChain(singleResult: unknown) {
  const self: any = new Proxy({}, {
    get(_, key: string) {
      if (key === 'single') return vi.fn().mockResolvedValue(singleResult)
      return vi.fn().mockReturnValue(self)
    },
  })
  return self
}

function setupAuthMock(user: typeof mockUser | null) {
  vi.mocked(createAuthClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

// Two sequential from() calls: first artifact lookup, then feedback insert
function setupDbMock(
  artifactResult: unknown = { data: mockArtifact, error: null },
  feedbackResult: unknown = { data: mockFeedback, error: null },
) {
  vi.mocked(createServerSupabaseClient).mockReturnValue({
    from: vi.fn()
      .mockReturnValueOnce(makeChain(artifactResult))
      .mockReturnValueOnce(makeChain(feedbackResult)),
  } as any)
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupAuthMock(mockUser)
  setupDbMock()
})

describe('POST /api/feedback', () => {
  describe('input validation', () => {
    it('returns 400 for malformed JSON', async () => {
      const req = new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json {{{',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for empty body', async () => {
      const res = await POST(makeRequest({}))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when content is too short (< 10 chars)', async () => {
      const res = await POST(makeRequest({ ...validBody, content: 'Too short' }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when content is too long (> 1000 chars)', async () => {
      const res = await POST(makeRequest({ ...validBody, content: 'x'.repeat(1001) }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when rating is out of range', async () => {
      const res = await POST(makeRequest({ ...validBody, rating: 6 }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when artifact_id is not a UUID', async () => {
      const res = await POST(makeRequest({ ...validBody, artifact_id: 'not-a-uuid' }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_ERROR')
    })
  })

  describe('authentication', () => {
    it('returns 401 when unauthenticated', async () => {
      setupAuthMock(null)
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(401)
      expect((await res.json()).code).toBe('UNAUTHORIZED')
    })
  })

  describe('artifact visibility', () => {
    it('returns 404 when artifact does not exist', async () => {
      setupDbMock({ data: null, error: { message: 'not found' } })
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(404)
      expect((await res.json()).code).toBe('NOT_FOUND')
    })

    it('returns 404 for private artifact owned by someone else', async () => {
      setupAuthMock({ ...mockUser, id: OTHER_ID })
      setupDbMock({ data: { ...mockArtifact, visibility: 'private', created_by: OWNER_ID }, error: null })
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(404)
      expect((await res.json()).code).toBe('NOT_FOUND')
    })

    it('allows owner to post feedback on their own private artifact', async () => {
      setupAuthMock(mockUser)
      setupDbMock(
        { data: { ...mockArtifact, visibility: 'private', created_by: OWNER_ID }, error: null },
        { data: mockFeedback, error: null },
      )
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(201)
    })
  })

  describe('success', () => {
    it('returns 201 with the created feedback', async () => {
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.feedback).toBeDefined()
      expect(body.feedback.id).toBe('fb-1')
    })

    it('accepts feedback without a rating', async () => {
      const { rating: _, ...noRating } = validBody
      const res = await POST(makeRequest(noRating))
      expect(res.status).toBe(201)
    })

    it('accepts feedback with rating at boundaries (1 and 5)', async () => {
      for (const rating of [1, 5]) {
        setupDbMock()
        const res = await POST(makeRequest({ ...validBody, rating }))
        expect(res.status).toBe(201)
      }
    })
  })

  describe('database errors', () => {
    it('returns 500 when insert fails', async () => {
      setupDbMock(
        { data: mockArtifact, error: null },
        { data: null, error: { message: 'db error' } },
      )
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(500)
      expect((await res.json()).code).toBe('DB_ERROR')
    })
  })
})
