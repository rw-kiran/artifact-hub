import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isPrivateUrl, safeFetch } from '@/lib/ssrf'

describe('isPrivateUrl', () => {
  it('blocks localhost', () => {
    expect(isPrivateUrl('http://localhost/test')).toBe(true)
  })

  it('blocks 127.0.0.1 loopback', () => {
    expect(isPrivateUrl('http://127.0.0.1/test')).toBe(true)
  })

  it('blocks 127.x.x.x range', () => {
    expect(isPrivateUrl('http://127.99.0.1/test')).toBe(true)
  })

  it('blocks 10.x.x.x private range', () => {
    expect(isPrivateUrl('http://10.0.0.1/resource')).toBe(true)
  })

  it('blocks 192.168.x.x private range', () => {
    expect(isPrivateUrl('http://192.168.1.100/resource')).toBe(true)
  })

  it('blocks 172.16.x.x private range', () => {
    expect(isPrivateUrl('http://172.16.0.1/resource')).toBe(true)
  })

  it('blocks 172.31.x.x private range', () => {
    expect(isPrivateUrl('http://172.31.255.255/resource')).toBe(true)
  })

  it('does not block 172.15.x.x (outside private range)', () => {
    expect(isPrivateUrl('http://172.15.0.1/resource')).toBe(false)
  })

  it('does not block 172.32.x.x (outside private range)', () => {
    expect(isPrivateUrl('http://172.32.0.1/resource')).toBe(false)
  })

  it('blocks 169.254.x.x link-local (AWS metadata endpoint)', () => {
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data/')).toBe(true)
  })

  it('blocks IPv6 loopback ::1', () => {
    expect(isPrivateUrl('http://[::1]/resource')).toBe(true)
  })

  it('blocks invalid (non-parseable) URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true)
  })

  it('allows public example.com', () => {
    expect(isPrivateUrl('https://example.com/image.png')).toBe(false)
  })

  it('allows CDN URLs', () => {
    expect(isPrivateUrl('https://cdn.jsdelivr.net/file.js')).toBe(false)
  })

  it('allows public IPs outside private ranges', () => {
    expect(isPrivateUrl('https://8.8.8.8/resource')).toBe(false)
  })

  it('blocks non-HTTP schemes', () => {
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true)
    expect(isPrivateUrl('ftp://internal.host/data')).toBe(true)
  })
})

describe('safeFetch', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('blocks redirect to private IP', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 301,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }))

    await expect(safeFetch('https://example.com/redirect')).rejects.toThrow(/Blocked/)
  })

  it('returns response for a clean URL without redirects', async () => {
    const ok = new Response('ok', { status: 200 })
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(ok)

    const res = await safeFetch('https://example.com/file.pdf')
    expect(res.status).toBe(200)
  })

  it('throws after too many redirects', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } })
    )

    await expect(safeFetch('https://example.com/loop')).rejects.toThrow(/Too many redirects/)
  })
})
