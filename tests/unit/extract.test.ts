import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/claude', () => ({
  langfuse: null,
  anthropic: {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Extracted content from document.' }],
      }),
    },
  },
}))

import { extractContent } from '@/lib/ai/extract'

describe('extractContent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('strips HTML tags for html type', async () => {
    const html = '<html><head><title>Test</title><style>body{}</style></head><body><script>alert(1)</script><p>Hello <strong>world</strong></p></body></html>'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
    )
    const result = await extractContent('https://example.com/a.html', 'html')
    expect(result).toContain('Hello')
    expect(result).toContain('world')
    expect(result).not.toContain('<')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('body{}')
  })

  it('calls Claude for PDF extraction', async () => {
    const { anthropic } = await import('@/lib/ai/claude')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new ArrayBuffer(16), { status: 200 })
    )
    const result = await extractContent('https://example.com/doc.pdf', 'pdf')
    expect(anthropic.messages.create).toHaveBeenCalledOnce()
    expect(result).toBe('Extracted content from document.')
  })

  it('calls Claude for image extraction', async () => {
    const { anthropic } = await import('@/lib/ai/claude')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new ArrayBuffer(16), { status: 200 })
    )
    const result = await extractContent('https://cdn.example.com/photo.jpg', 'image')
    expect(anthropic.messages.create).toHaveBeenCalledOnce()
    expect(result).toBe('Extracted content from document.')
  })

  it('returns empty string and does not throw when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))
    const result = await extractContent('https://example.com/a.html', 'html')
    expect(result).toBe('')
  })
})
