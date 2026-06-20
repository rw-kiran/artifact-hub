import Link from 'next/link'
import Image from 'next/image'
import type { Artifact } from '@/lib/types'

const TYPE_COLORS: Record<Artifact['type'], string> = {
  html: 'bg-blue-100 text-blue-700',
  image: 'bg-green-100 text-green-700',
  pdf: 'bg-red-100 text-red-700',
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <Link
      href={`/artifacts/${artifact.id}`}
      className="block rounded-lg border bg-white overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="h-36 bg-gray-100 relative flex items-center justify-center overflow-hidden">
        {artifact.type === 'image' ? (
          <Image
            src={artifact.blob_url}
            alt={artifact.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <span className={`text-sm font-semibold px-3 py-1 rounded ${TYPE_COLORS[artifact.type]}`}>
            {artifact.type.toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLORS[artifact.type]}`}>
            {artifact.type.toUpperCase()}
          </span>
        </div>
        <h3 className="font-medium text-sm line-clamp-1">{artifact.title}</h3>
        {artifact.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{artifact.description}</p>
        )}
        {artifact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {artifact.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-gray-400">
          {artifact.creator_name ?? 'Anonymous'} · {relativeDate(artifact.created_at)}
        </div>
      </div>
    </Link>
  )
}
