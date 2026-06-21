import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/embed', () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}))

vi.mock('@/lib/ai/extract', () => ({
  extractContent: vi.fn().mockResolvedValue('Sample extracted text. Another sentence here.'),
}))

vi.mock('@/lib/ai/claude', () => ({ langfuse: null }))

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null })
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete, insert: mockInsert, update: mockUpdate })

vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: () => ({ from: mockFrom }),
}))

import { ingestArtifact } from '@/lib/ai/ingest'

describe('ingestArtifact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts chunk rows and sets index_status=indexed for HTML artifacts', async () => {
    await ingestArtifact('artifact-id', 'https://example.com/file.html', 'html')
    expect(mockInsert).toHaveBeenCalledOnce()
    const rows = mockInsert.mock.calls[0][0] as { artifact_id: string; chunk_index: number }[]
    expect(rows[0].artifact_id).toBe('artifact-id')
    expect(rows[0].chunk_index).toBe(0)
    expect(mockUpdate).toHaveBeenCalledWith({ index_status: 'indexed' })
  })

  it('inserts chunks for image artifacts via text extraction', async () => {
    const { extractContent } = await import('@/lib/ai/extract')
    vi.mocked(extractContent).mockResolvedValueOnce('A vibrant mountain landscape at golden hour.')
    await ingestArtifact('img-id', 'https://cdn.example.com/photo.jpg', 'image')
    expect(extractContent).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg', 'image')
    const rows = mockInsert.mock.calls[0][0] as { content: string }[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].content).toBeTruthy()
  })

  it('sets index_status=failed and never throws when embedTexts rejects', async () => {
    const { embedTexts } = await import('@/lib/ai/embed')
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('API down'))
    await expect(ingestArtifact('x', 'https://example.com/a.html', 'html')).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledWith({ index_status: 'failed' })
  })

  it('sets index_status=failed and never throws when Supabase insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ error: new Error('DB error') })
    await expect(ingestArtifact('y', 'https://example.com/b.html', 'html')).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledWith({ index_status: 'failed' })
  })

  it('sets index_status=failed when extractContent returns empty string', async () => {
    const { extractContent } = await import('@/lib/ai/extract')
    vi.mocked(extractContent).mockResolvedValueOnce('')
    await ingestArtifact('z', 'https://example.com/empty.html', 'html')
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({ index_status: 'failed' })
  })
})
