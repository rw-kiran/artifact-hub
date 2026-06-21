import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/db/supabase', () => ({
  createAuthClient: vi.fn().mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({
    url: 'https://blob.vercel-storage.com/test.html',
    pathname: 'artifacts/uuid/test.html',
    contentType: 'text/html',
    contentDisposition: 'inline; filename="test.html"',
    downloadUrl: 'https://blob.vercel-storage.com/test.html?download=1',
    etag: '"abc123"',
  }),
}))

import { POST } from '@/app/api/upload/route'
import { put } from '@vercel/blob'
import { createAuthClient } from '@/lib/db/supabase'

function makeRequest(opts: {
  contentType?: string
  contentLength?: number
  filename?: string
  noBody?: boolean
} = {}): Request {
  const url = new URL('http://localhost/api/upload')
  if (opts.filename) url.searchParams.set('filename', opts.filename)
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'text/html',
  }
  if (opts.contentLength !== undefined) {
    headers['content-length'] = String(opts.contentLength)
  }
  // body: null → request.body is null (triggers MISSING_FILE)
  const body = opts.noBody ? null : 'file-content'
  return new Request(url.toString(), { method: 'POST', headers, body })
}

beforeEach(() => {
  vi.mocked(createAuthClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  } as any)
  vi.mocked(put).mockResolvedValue({
    url: 'https://blob.vercel-storage.com/test.html',
    pathname: 'artifacts/uuid/test.html',
    contentType: 'text/html',
    contentDisposition: 'inline; filename="test.html"',
    downloadUrl: 'https://blob.vercel-storage.com/test.html?download=1',
    etag: '"abc123"',
  })
})

describe('POST /api/upload', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createAuthClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHORIZED')
  })

  it('returns 415 for exe MIME type', async () => {
    const res = await POST(makeRequest({ contentType: 'application/x-msdownload' }))
    expect(res.status).toBe(415)
    expect((await res.json()).code).toBe('INVALID_MIME')
  })

  it('returns 415 for text/javascript', async () => {
    const res = await POST(makeRequest({ contentType: 'text/javascript' }))
    expect(res.status).toBe(415)
    expect((await res.json()).code).toBe('INVALID_MIME')
  })

  it('returns 413 for content-length over 50 MB', async () => {
    const res = await POST(makeRequest({ contentLength: 52428801 }))
    expect(res.status).toBe(413)
    expect((await res.json()).code).toBe('FILE_TOO_LARGE')
  })

  it('returns 400 when no body', async () => {
    const res = await POST(makeRequest({ noBody: true }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('MISSING_FILE')
  })

  it.each([
    ['text/html'],
    ['image/png'],
    ['application/pdf'],
  ])('returns 200 for %s', async (mime) => {
    const res = await POST(makeRequest({ contentType: mime, filename: 'test' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBeDefined()
    expect(body.pathname).toBeDefined()
    expect(body.contentType).toBe(mime)
  })

  it('passes request.body stream directly to put (no buffering)', async () => {
    const req = makeRequest({ contentType: 'text/html', filename: 'test.html' })
    await POST(req)
    const [, sentBody] = vi.mocked(put).mock.calls[0]
    // The body passed to put must be a stream, not a string/buffer
    expect(sentBody).toBeInstanceOf(ReadableStream)
  })

  it('returns 500 when blob.put throws', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Storage unavailable'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('UPLOAD_ERROR')
  })
})
