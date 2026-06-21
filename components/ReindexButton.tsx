'use client'

import { useState } from 'react'

export function ReindexButton({ artifactId }: { artifactId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleClick() {
    setState('loading')
    await fetch(`/api/artifacts/${artifactId}/reindex`, { method: 'POST' })
    setState('done')
  }

  if (state === 'done') return <span className="text-xs text-gray-400">Reindexing…</span>

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="text-xs text-amber-600 hover:text-amber-800 underline disabled:opacity-50"
    >
      {state === 'loading' ? 'Starting…' : 'Retry AI index'}
    </button>
  )
}
