import { createServerSupabaseClient } from '@/lib/db/supabase'
import { ArtifactViewer } from '@/components/ArtifactViewer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Artifact } from '@/lib/types'

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServerSupabaseClient()

  const { data: tokenRow } = await supabase
    .from('share_tokens')
    .select('artifact_id, expires_at')
    .eq('token', token)
    .single()

  if (!tokenRow) notFound()

  if (new Date(tokenRow.expires_at) <= new Date()) {
    return (
      <main className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <h1 className="text-2xl font-bold mb-4">This link has expired</h1>
        <p className="text-gray-500 mb-6">
          The owner can generate a new share link from the artifact page.
        </p>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Browse public artifacts
        </Link>
      </main>
    )
  }

  const { data: artifactData } = await supabase
    .from('artifacts')
    .select('*')
    .eq('id', tokenRow.artifact_id)
    .single()

  if (!artifactData) notFound()

  const artifact = artifactData as Artifact

  const htmlContent = artifact.type === 'html'
    ? await fetch(artifact.blob_url).then(r => r.text()).catch(() => undefined)
    : undefined

  const hoursRemaining = Math.ceil(
    (new Date(tokenRow.expires_at).getTime() - Date.now()) / 3_600_000,
  )

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Browse artifacts
        </Link>
        <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
          Shared link · expires in {hoursRemaining}h
        </span>
      </div>
      <h1 className="text-2xl font-bold mb-2">{artifact.title}</h1>
      {artifact.description && (
        <p className="text-gray-600 mb-4">{artifact.description}</p>
      )}
      {artifact.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {artifact.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-400 mb-6">
        by {artifact.creator_name ?? 'Anonymous'} &middot;{' '}
        {new Date(artifact.created_at).toLocaleDateString()}
      </p>
      <ArtifactViewer artifact={artifact} htmlContent={htmlContent} />
    </main>
  )
}
