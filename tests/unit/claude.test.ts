import { describe, it, expect, vi, beforeEach } from 'vitest'

// @anthropic-ai/sdk is top-level imported in claude.ts, so the factory runs before
// any const declarations here. Define vi.fn() inside the factory; access it via
// the exported `anthropic` singleton after the import below.
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}))

vi.mock('langfuse', () => ({ Langfuse: vi.fn() }))

vi.mock('@/lib/ai/extract', () => ({
  extractContent: vi.fn().mockResolvedValue('Sample content about a machine learning dashboard.'),
}))

// @/lib/db/supabase is dynamically imported inside summarizeFeedback, so the factory
// runs lazily — these const declarations ARE in scope by then.
const mockFeedbackLimit = vi.fn().mockResolvedValue({
  data: [
    { content: 'Great artifact, really useful!', rating: 5 },
    { content: 'Well structured and easy to follow.', rating: 4 },
  ],
})
const mockArtifactEq = vi.fn().mockResolvedValue({ data: null, error: null })
const mockArtifactUpdate = vi.fn().mockReturnValue({ eq: mockArtifactEq })

vi.mock('@/lib/db/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) =>
      table === 'feedback'
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({ limit: mockFeedbackLimit }),
              }),
            }),
          }
        : { update: mockArtifactUpdate },
  }),
}))

import { generateMetadata, summarizeFeedback, anthropic } from '@/lib/ai/claude'

describe('generateMetadata', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed metadata from a clean JSON response', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"title":"ML Dashboard","description":"A data viz tool","tags":["ml","dashboard"]}' }],
    })
    const result = await generateMetadata('https://cdn.example.com/a.html', 'html')
    expect(result.title).toBe('ML Dashboard')
    expect(result.tags).toContain('ml')
  })

  it('strips ```json fences before parsing', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n{"title":"Fenced","description":"d","tags":["x"]}\n```' }],
    })
    const result = await generateMetadata('https://cdn.example.com/a.html', 'html')
    expect(result.title).toBe('Fenced')
  })

  it('strips plain ``` fences (no json label) before parsing', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: '```\n{"title":"Plain","description":"d","tags":["x"]}\n```' }],
    })
    const result = await generateMetadata('https://cdn.example.com/a.html', 'html')
    expect(result.title).toBe('Plain')
  })

  it('falls back to Untitled when Claude returns non-JSON prose', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot generate metadata for this content.' }],
    })
    const result = await generateMetadata('https://cdn.example.com/a.html', 'html')
    expect(result).toEqual({ title: 'Untitled', description: '', tags: [] })
  })
})

describe('summarizeFeedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when fewer than 2 feedback rows exist', async () => {
    mockFeedbackLimit.mockResolvedValueOnce({ data: [{ content: 'Only one review', rating: 5 }] })
    const result = await summarizeFeedback('artifact-id')
    expect(result).toBeNull()
    expect(anthropic.messages.create).not.toHaveBeenCalled()
  })

  it('returns null when no rows exist', async () => {
    mockFeedbackLimit.mockResolvedValueOnce({ data: [] })
    const result = await summarizeFeedback('artifact-id')
    expect(result).toBeNull()
  })

  it('returns summary and patches the artifacts table', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Users found this very helpful and well-structured.' }],
    })
    const result = await summarizeFeedback('artifact-id')
    expect(result).toBe('Users found this very helpful and well-structured.')
    expect(mockArtifactUpdate).toHaveBeenCalledWith({ feedback_summary: result })
    expect(mockArtifactEq).toHaveBeenCalledWith('id', 'artifact-id')
  })

  it('returns null and skips DB update when Claude returns no text block', async () => {
    vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ content: [] })
    const result = await summarizeFeedback('artifact-id')
    expect(result).toBeNull()
    expect(mockArtifactUpdate).not.toHaveBeenCalled()
  })
})
