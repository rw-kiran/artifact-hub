'use client'

import { useState, useEffect } from 'react'
import type { Artifact } from '@/lib/types'

export function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  const [srcdoc, setSrcdoc] = useState<string | null>(null)

  useEffect(() => {
    if (artifact.type !== 'html') return
    fetch(artifact.blob_url)
      .then((r) => r.text())
      .then(setSrcdoc)
      .catch(() => setSrcdoc('<p style="padding:1rem;color:#666">Failed to load content.</p>'))
  }, [artifact.blob_url, artifact.type])

  if (artifact.type === 'html') {
    return (
      <iframe
        srcDoc={srcdoc ?? ''}
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-[600px] border rounded-lg bg-white"
        title={artifact.title}
      />
    )
  }
  if (artifact.type === 'image') {
    return (
      <div className="flex justify-center">
        <img
          src={artifact.blob_url}
          alt={artifact.title}
          className="max-w-full max-h-[600px] object-contain rounded-lg"
        />
      </div>
    )
  }
  return (
    <embed
      src={artifact.blob_url}
      type="application/pdf"
      className="w-full h-[600px] rounded-lg"
    />
  )
}
