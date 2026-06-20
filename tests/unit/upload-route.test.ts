import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({
    url: 'https://blob.vercel-storage.com/test.html',
    pathname: 'artifacts/uuid/test.html',
  }),
}))

import { POST } from '@/app/api/upload/route'
import { put } from '@vercel/blob'

function makeRequest(file: { type: string; size: number; name: string } | null): Request {
  const req = new Request('http://localhost/api/upload', { method: 'POST', body: '' })
  vi.spyOn(req, 'formData').mockResolvedValue({
    get: (key: string) => (key === 'file' ? file : null),
  } as unknown as FormData)
  return req
}

beforeEach(() => vi.mocked(put).mockResolvedValue({
  url: 'https://blob.vercel-storage.com/test.html',
  pathname: 'artifacts/uuid/test.html',
  contentType: 'text/html',
  contentDisposition: 'inline; filename="test.html"',
  downloadUrl: 'https://blob.vercel-storage.com/test.html?download=1',
  etag: '"abc123"',
}))

describe('POST /api/upload', () => {
  it('returns 400 when no file', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('MISSING_FILE')
  })

  it('returns 415 for exe MIME type', async () => {
    const res = await POST(makeRequest({ type: 'application/x-msdownload', size: 100, name: 'virus.exe' }))
    expect(res.status).toBe(415)
    expect((await res.json()).code).toBe('INVALID_MIME')
  })

  it('returns 415 for text/javascript', async () => {
    const res = await POST(makeRequest({ type: 'text/javascript', size: 100, name: 'script.js' }))
    expect(res.status).toBe(415)
    expect((await res.json()).code).toBe('INVALID_MIME')
  })

  it('returns 413 for file over 50 MB', async () => {
    const res = await POST(makeRequest({ type: 'text/html', size: 52428801, name: 'big.html' }))
    expect(res.status).toBe(413)
    expect((await res.json()).code).toBe('FILE_TOO_LARGE')
  })

  it.each([
    ['text/html', 'html'],
    ['image/png', 'png'],
    ['application/pdf', 'pdf'],
  ])('returns 200 for %s', async (mime) => {
    const res = await POST(makeRequest({ type: mime, size: 1000, name: 'test' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBeDefined()
    expect(body.pathname).toBeDefined()
    expect(body.contentType).toBe(mime)
  })

  it('returns 500 when blob.put throws', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Storage unavailable'))
    const res = await POST(makeRequest({ type: 'text/html', size: 100, name: 'test.html' }))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('UPLOAD_ERROR')
  })
})
