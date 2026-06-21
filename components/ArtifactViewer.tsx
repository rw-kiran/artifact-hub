import type { Artifact } from '@/lib/types'

export function ArtifactViewer({ artifact, htmlContent }: { artifact: Artifact; htmlContent?: string }) {
  if (artifact.type === 'html') {
    return (
      <iframe
        {...(htmlContent ? { srcdoc: htmlContent } : { src: artifact.blob_url })}
        sandbox="allow-scripts"
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
