'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAllowedMimeType, MAX_FILE_SIZE_BYTES } from '@/lib/validation'
import type { ArtifactType } from '@/lib/types'

type Step = 'select' | 'uploading' | 'details' | 'submitting'

function mimeToType(mime: string): ArtifactType {
  if (mime === 'text/html') return 'html'
  if (mime === 'application/pdf') return 'pdf'
  return 'image'
}

export function UploadForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [error, setError] = useState<string | null>(null)
  const [blobResult, setBlobResult] = useState<{ url: string; pathname: string; contentType: string } | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  async function handleFile(file: File) {
    setError(null)
    if (!isAllowedMimeType(file.type)) {
      setError('Invalid file type. Accepted: HTML, images (JPEG/PNG/GIF/WebP), PDF.')
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File too large. Maximum size is 50 MB.')
      return
    }
    setStep('uploading')
    try {
      // Send file as raw body — server streams it directly to Vercel Blob without buffering.
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
        setStep('select')
        return
      }
      setBlobResult(data)
      setStep('details')
    } catch {
      setError('Upload failed. Please try again.')
      setStep('select')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!blobResult) return
    setStep('submitting')
    setError(null)
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blob_url: blobResult.url,
          blob_pathname: blobResult.pathname,
          type: mimeToType(blobResult.contentType),
          title: title || undefined,
          description: description || undefined,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          visibility,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save artifact')
        setStep('details')
        return
      }
      router.push(`/artifacts/${data.artifact.id}`)
    } catch {
      setError('Failed to save. Please try again.')
      setStep('details')
    }
  }

  if (step === 'select' || step === 'uploading') {
    return (
      <div className="space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => step === 'select' && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file && step === 'select') handleFile(file)
          }}
        >
          {step === 'uploading' ? (
            <p className="text-gray-500">Uploading...</p>
          ) : (
            <>
              <p className="text-gray-500">Drop a file here, or click to select</p>
              <p className="text-xs text-gray-400 mt-1">HTML · Images · PDF · max 50 MB</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm,image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="design, quarterly, draft (comma-separated)"
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Visibility</label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={step === 'submitting'}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50"
      >
        {step === 'submitting' ? 'Saving...' : 'Publish Artifact'}
      </button>
    </form>
  )
}
