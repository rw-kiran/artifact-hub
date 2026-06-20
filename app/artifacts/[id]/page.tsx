import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { ArtifactViewer } from '@/components/ArtifactViewer'
import { ShareModal } from '@/components/ShareModal'
import { FeedbackPanel } from '@/components/FeedbackPanel'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import type { Artifact, Feedback } from '@/lib/types'

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const artifact = data as Artifact

  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient({
    getAll: () => cookieStore.getAll(),
    set: () => {},
  }).auth.getUser()

  if (artifact.visibility === 'private') {
    if (!user || user.id !== artifact.created_by) notFound()
  }

  const isOwner = user?.id === artifact.created_by

  const { data: feedbackData } = await supabase
    .from('feedback')
    .select('*')
    .eq('artifact_id', id)
    .order('created_at', { ascending: true })
  const feedback = (feedbackData ?? []) as Feedback[]

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Gallery
        </Link>
      </div>
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">{artifact.title}</h1>
        {isOwner && <ShareModal artifactId={artifact.id} />}
      </div>
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
      <ArtifactViewer artifact={artifact} />
      <FeedbackPanel
        initialFeedback={feedback}
        artifactId={artifact.id}
        currentUser={user ? { email: user.email!, name: user.user_metadata?.full_name ?? null } : null}
      />
    </main>
  )
}
