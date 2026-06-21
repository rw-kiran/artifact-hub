import { describe, it, expect } from 'vitest'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES, CreateArtifactSchema, ShareCreateSchema, AddFeedbackSchema } from '@/lib/validation'

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

describe('ShareCreateSchema', () => {
  const validShare = { artifact_id: '00000000-0000-0000-0000-000000000000' }

  it('accepts valid artifact_id', () => {
    expect(ShareCreateSchema.safeParse(validShare).success).toBe(true)
  })

  it('defaults expires_in_hours to 24', () => {
    const result = ShareCreateSchema.safeParse(validShare)
    expect(result.success && result.data.expires_in_hours).toBe(24)
  })

  it('rejects missing artifact_id', () => {
    expect(ShareCreateSchema.safeParse({}).success).toBe(false)
  })

  it('rejects non-UUID artifact_id', () => {
    expect(ShareCreateSchema.safeParse({ artifact_id: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects expires_in_hours below 1', () => {
    expect(ShareCreateSchema.safeParse({ ...validShare, expires_in_hours: 0 }).success).toBe(false)
  })

  it('rejects expires_in_hours above 168', () => {
    expect(ShareCreateSchema.safeParse({ ...validShare, expires_in_hours: 169 }).success).toBe(false)
  })

  it('accepts expires_in_hours at boundaries', () => {
    expect(ShareCreateSchema.safeParse({ ...validShare, expires_in_hours: 1 }).success).toBe(true)
    expect(ShareCreateSchema.safeParse({ ...validShare, expires_in_hours: 168 }).success).toBe(true)
  })
})

describe('AddFeedbackSchema', () => {
  const validFeedback = {
    artifact_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    content: 'This is a great artifact!',
  }

  it('accepts valid feedback without rating', () => {
    expect(AddFeedbackSchema.safeParse(validFeedback).success).toBe(true)
  })

  it('accepts valid feedback with rating', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 3 }).success).toBe(true)
  })

  it('accepts rating at boundaries (1 and 5)', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 1 }).success).toBe(true)
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 5 }).success).toBe(true)
  })

  it('rejects content shorter than 10 characters', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, content: 'Too short' }).success).toBe(false)
  })

  it('rejects content longer than 1000 characters', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, content: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('accepts content at boundaries (10 and 1000 chars)', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, content: 'x'.repeat(10) }).success).toBe(true)
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, content: 'x'.repeat(1000) }).success).toBe(true)
  })

  it('rejects rating of 0', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 0 }).success).toBe(false)
  })

  it('rejects rating of 6', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 6 }).success).toBe(false)
  })

  it('rejects non-integer rating', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, rating: 3.5 }).success).toBe(false)
  })

  it('rejects non-UUID artifact_id', () => {
    expect(AddFeedbackSchema.safeParse({ ...validFeedback, artifact_id: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects missing content', () => {
    expect(AddFeedbackSchema.safeParse({ artifact_id: validFeedback.artifact_id }).success).toBe(false)
  })

  it('rejects missing artifact_id', () => {
    expect(AddFeedbackSchema.safeParse({ content: validFeedback.content }).success).toBe(false)
  })
})
