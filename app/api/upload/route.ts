import { put } from '@vercel/blob'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES } from '@/lib/validation'
import { cookies } from 'next/headers'
import { createAuthClient } from '@/lib/db/supabase'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data', code: 'MISSING_FILE' }, { status: 400 })
  }
  const file = formData.get('file') as File | null

  if (!file) {
    return Response.json({ error: 'No file provided', code: 'MISSING_FILE' }, { status: 400 })
  }
  if (!isAllowedMimeType(file.type)) {
    return Response.json({ error: 'Invalid file type', code: 'INVALID_MIME' }, { status: 415 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json({ error: 'File too large (max 50 MB)', code: 'FILE_TOO_LARGE' }, { status: 413 })
  }

  try {
    const pathname = `artifacts/${crypto.randomUUID()}/${file.name}`
    // ponytail: Vercel Blob free tier only supports public access. Private-visibility
    // artifacts are hidden at the app layer (RLS + auth) but the CDN URL is guessable
    // if leaked. Upgrade to protected blobs (paid Vercel plan) or proxy reads through
    // /api/artifacts/[id]/content with auth checks to close this gap.
    const blob = await put(pathname, file, { access: 'public', contentType: file.type })
    return Response.json({ url: blob.url, pathname: blob.pathname, contentType: file.type })
  } catch (e) {
    console.error(JSON.stringify({ event: 'upload_error', error: e instanceof Error ? e.message : String(e) }))
    return Response.json({ error: 'Upload failed', code: 'UPLOAD_ERROR' }, { status: 500 })
  }
}
