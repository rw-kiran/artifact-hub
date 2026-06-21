import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Artifact } from '@/lib/types'

const mockArtifact: Artifact = {
  id: 'abc-123',
  title: 'Test artifact',
  description: 'A test',
  tags: ['test'],
  type: 'html',
  blob_url: 'https://cdn.example.com/a.html',
  blob_pathname: 'artifacts/abc/a.html',
  created_by: null,
  creator_name: null,
  creator_email: null,
  visibility: 'public',
  feedback_summary: null,
  index_status: 'indexed',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

vi.mock('@/lib/ai/embed', () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2]]),
}))

vi.mock('@/lib/ai/claude', () => ({
  langfuse: null,
  anthropic: {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '[1]' }] }),
    },
  },
}))

const mockRpc = vi.fn()
const mockTextSearch = vi.fn()
const mockSelect = vi.fn()
const mockIn = vi.fn()

vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: () => ({
    rpc: mockRpc,
    from: vi.fn().mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          textSearch: mockTextSearch.mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
        }),
        in: mockIn.mockResolvedValue({ data: [mockArtifact] }),
      }),
    }),
  }),
}))

import { hybridSearch } from '@/lib/ai/search'

describe('hybridSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({
      data: [{ artifact_id: 'abc-123', title: 'Test', description: 'Desc', type: 'html', tags: [], blob_url: '', creator_name: null, created_at: '', rrf_score: 0.9, min_cosine_dist: 0.2 }],
      error: null,
    })
  })

  it('returns artifacts from hybrid_search RPC', async () => {
    const results = await hybridSearch('test query')
    expect(mockRpc).toHaveBeenCalledWith('hybrid_search', expect.objectContaining({
      query_text: 'test query',
      max_distance: expect.any(Number),
    }))
    expect(results.length).toBeGreaterThan(0)
  })

  it('falls back to FTS when embedTexts fails', async () => {
    const { embedTexts } = await import('@/lib/ai/embed')
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('no GOOGLE_API_KEY'))
    await hybridSearch('fallback query')
    // FTS path: should call textSearch, not RPC
    expect(mockTextSearch).toHaveBeenCalled()
  })

  it('returns empty array when no results', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    mockTextSearch.mockReturnValueOnce({ limit: vi.fn().mockResolvedValue({ data: [] }) })
    const results = await hybridSearch('noresults')
    expect(results).toEqual([])
  })
})
