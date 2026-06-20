import { put } from '@vercel/blob'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES } from '@/lib/validation'

export async function POST(request: Request) {
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
    const blob = await put(pathname, file, { access: 'public', contentType: file.type, contentDisposition: 'inline' })
    return Response.json({ url: blob.url, pathname: blob.pathname, contentType: file.type })
  } catch (e) {
    console.error(JSON.stringify({ event: 'upload_error', error: e instanceof Error ? e.message : String(e) }))
    return Response.json({ error: 'Upload failed', code: 'UPLOAD_ERROR' }, { status: 500 })
  }
}
