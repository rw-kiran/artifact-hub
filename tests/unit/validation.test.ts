import { describe, it, expect } from 'vitest'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES, CreateArtifactSchema } from '@/lib/validation'

describe('isAllowedMimeType', () => {
  it.each(['text/html', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'])(
    'accepts %s',
    (mime) => expect(isAllowedMimeType(mime)).toBe(true),
  )

  it.each(['application/x-msdownload', 'text/javascript', 'application/octet-stream', ''])(
    'rejects %s',
    (mime) => expect(isAllowedMimeType(mime)).toBe(false),
  )
})

describe('MAX_FILE_SIZE_BYTES', () => {
  it('equals 50 MB', () => expect(MAX_FILE_SIZE_BYTES).toBe(52428800))
})

describe('CreateArtifactSchema', () => {
  const valid = {
    blob_url: 'https://blob.vercel-storage.com/test.html',
    blob_pathname: 'artifacts/test.html',
    type: 'html' as const,
  }

  it('accepts minimal valid input', () => {
    expect(CreateArtifactSchema.safeParse(valid).success).toBe(true)
  })

  it('defaults visibility to public', () => {
    const result = CreateArtifactSchema.safeParse(valid)
    expect(result.success && result.data.visibility).toBe('public')
  })

  it('rejects missing blob_url', () => {
    expect(CreateArtifactSchema.safeParse({ blob_pathname: valid.blob_pathname, type: valid.type }).success).toBe(false)
  })

  it('rejects missing blob_pathname', () => {
    expect(CreateArtifactSchema.safeParse({ blob_url: valid.blob_url, type: valid.type }).success).toBe(false)
  })

  it('rejects missing type', () => {
    expect(CreateArtifactSchema.safeParse({ blob_url: valid.blob_url, blob_pathname: valid.blob_pathname }).success).toBe(false)
  })

  it('rejects invalid type', () => {
    expect(CreateArtifactSchema.safeParse({ ...valid, type: 'docx' }).success).toBe(false)
  })

  it('rejects non-URL blob_url', () => {
    expect(CreateArtifactSchema.safeParse({ ...valid, blob_url: 'not-a-url' }).success).toBe(false)
  })

  it('rejects tags array over 10 items', () => {
    expect(CreateArtifactSchema.safeParse({ ...valid, tags: Array(11).fill('x') }).success).toBe(false)
  })

  it('accepts all optional fields', () => {
    expect(
      CreateArtifactSchema.safeParse({
        ...valid,
        title: 'My Artifact',
        description: 'A description',
        tags: ['a', 'b'],
        visibility: 'private' as const,
      }).success,
    ).toBe(true)
  })
})
