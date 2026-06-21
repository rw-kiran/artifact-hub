import { put } from '@vercel/blob'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES } from '@/lib/validation'
import { cookies } from 'next/headers'
import { createAuthClient } from '@/lib/db/supabase'

// Allow up to 60 s for large file uploads on slow connections.
// Vercel Hobby: 10 s max (upgrade to Pro for this to take effect).
export const maxDuration = 60

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Validate before touching the body stream — fast rejection, no buffering.
  const contentType = request.headers.get('content-type') ?? ''
  if (!isAllowedMimeType(contentType)) {
    return Response.json({ error: 'Invalid file type', code: 'INVALID_MIME' }, { status: 415 })
  }

  // Content-Length is set automatically by the browser for File/Blob bodies.
  // If absent (chunked transfer), we skip the check — Vercel Blob enforces its own limit.
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    return Response.json({ error: 'File too large (max 50 MB)', code: 'FILE_TOO_LARGE' }, { status: 413 })
  }

  if (!request.body) {
    return Response.json({ error: 'No file body', code: 'MISSING_FILE' }, { status: 400 })
  }

  const filename = new URL(request.url).searchParams.get('filename') ?? 'artifact'

  try {
    const pathname = `artifacts/${crypto.randomUUID()}/${filename}`
    // ponytail: Vercel Blob free tier only supports public access. Private-visibility
    // artifacts are hidden at the app layer (RLS + auth) but the CDN URL is guessable
    // if leaked. Upgrade to protected blobs (paid Vercel plan) or proxy reads through
    // /api/artifacts/[id]/content with auth checks to close this gap.
    const blob = await put(pathname, request.body, { access: 'public', contentType })
    return Response.json({ url: blob.url, pathname: blob.pathname, contentType })
  } catch (e) {
    console.error(JSON.stringify({ event: 'upload_error', error: e instanceof Error ? e.message : String(e) }))
    return Response.json({ error: 'Upload failed', code: 'UPLOAD_ERROR' }, { status: 500 })
  }
}
