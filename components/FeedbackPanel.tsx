'use client'

import { useState } from 'react'
import type { Feedback } from '@/lib/types'

interface Props {
  initialFeedback: Feedback[]
  artifactId: string
  currentUser: { email: string; name: string | null } | null
}

export function FeedbackPanel({ initialFeedback, artifactId, currentUser }: Props) {
  const [feedback, setFeedback] = useState(initialFeedback)
  const [content, setContent] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser) return

    const optimistic: Feedback = {
      id: `temp-${Date.now()}`,
      artifact_id: artifactId,
      author_email: currentUser.email,
      author_name: currentUser.name,
      content,
      rating,
      created_at: new Date().toISOString(),
    }

    setFeedback(prev => [...prev, optimistic])
    const savedContent = content
    const savedRating = rating
    setContent('')
    setRating(null)
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, content: savedContent, rating: savedRating ?? undefined }),
      })

      if (!res.ok) throw new Error('server')

      const { feedback: real } = await res.json()
      setFeedback(prev => prev.map(f => f.id === optimistic.id ? real : f))
    } catch {
      setFeedback(prev => prev.filter(f => f.id !== optimistic.id))
      setError('Failed to post comment. Please try again.')
      setContent(savedContent)
      setRating(savedRating)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold mb-4">Feedback</h2>

      {feedback.length === 0 && (
        <p className="text-sm text-gray-500 mb-6">No comments yet.</p>
      )}

      <div className="space-y-4 mb-8">
        {feedback.map(item => (
          <div key={item.id} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{item.author_name ?? item.author_email}</span>
              <div className="flex items-center gap-2">
                {item.rating !== null && (
                  <span className="text-yellow-400 text-sm">
                    {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-700">{item.content}</p>
          </div>
        ))}
      </div>

      {currentUser ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="text-sm font-medium">Leave a comment</h3>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className="text-xl text-yellow-400 focus:outline-none"
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                {rating !== null && n <= rating ? '★' : '☆'}
              </button>
            ))}
            {rating !== null && (
              <span className="text-xs text-gray-400 ml-1 self-center">{rating}/5</span>
            )}
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your feedback (10–1000 characters)..."
            className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-gray-200"
            required
            minLength={10}
            maxLength={1000}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting || content.length < 10}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            {submitting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-gray-500">
          <a href="/auth/signin" className="underline hover:text-gray-700">Sign in</a>{' '}
          to leave feedback.
        </p>
      )}
    </div>
  )
}
