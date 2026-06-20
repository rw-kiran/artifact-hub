import { describe, it, expect } from 'vitest'
import { isFkViolation, assertUuid } from '@/lib/mcp/utils'

describe('isFkViolation', () => {
  it('matches foreign key constraint violations', () => {
    expect(
      isFkViolation('insert or update on table "feedback" violates foreign key constraint "feedback_artifact_id_fkey"'),
    ).toBe(true)
  })

  it('does not match not-null violations', () => {
    expect(isFkViolation('null value in column "email" violates not-null constraint')).toBe(false)
  })

  it('does not match unique constraint violations', () => {
    expect(isFkViolation('duplicate key value violates unique constraint "users_email_key"')).toBe(false)
  })

  it('does not match empty strings', () => {
    expect(isFkViolation('')).toBe(false)
  })
})

describe('assertUuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(() => assertUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'id')).not.toThrow()
  })

  it('accepts uppercase UUID', () => {
    expect(() => assertUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'id')).not.toThrow()
  })

  it('throws on a plain string', () => {
    expect(() => assertUuid('not-a-uuid', 'artifact_id')).toThrow('Invalid artifact_id')
  })

  it('throws on a number', () => {
    expect(() => assertUuid(42, 'id')).toThrow('Invalid id')
  })

  it('throws on null', () => {
    expect(() => assertUuid(null, 'id')).toThrow('Invalid id')
  })

  it('throws on undefined', () => {
    expect(() => assertUuid(undefined, 'id')).toThrow('Invalid id')
  })

  it('includes the name in the error message', () => {
    expect(() => assertUuid('bad', 'artifact_id')).toThrow('artifact_id')
  })
})
