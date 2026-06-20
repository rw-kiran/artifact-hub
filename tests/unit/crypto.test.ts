import { describe, it, expect } from 'vitest'
import { sha256 } from '@/lib/crypto'

describe('sha256', () => {
  it('produces a 64-char hex string', async () => {
    const result = await sha256('test')
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', async () => {
    expect(await sha256('hello')).toBe(await sha256('hello'))
  })

  it('produces different output for different inputs', async () => {
    expect(await sha256('a')).not.toBe(await sha256('b'))
  })

  it('matches known SHA-256 of empty string', async () => {
    expect(await sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

})
