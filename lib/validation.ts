import { z } from 'zod'

export const ALLOWED_MIME_TYPES = [
  'text/html',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export function isAllowedMimeType(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

export const CreateArtifactSchema = z.object({
  blob_url: z.string().url(),
  blob_pathname: z.string().min(1),
  type: z.enum(['html', 'image', 'pdf']),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
})

export type CreateArtifactInput = z.infer<typeof CreateArtifactSchema>
