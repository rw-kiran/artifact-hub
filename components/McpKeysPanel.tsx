'use client'

import { useState } from 'react'
import { CopyIcon, CheckIcon } from '@/components/icons'
import type { McpApiKey } from '@/lib/types'

export function McpKeysPanel({ initialKeys }: { initialKeys: McpApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys)
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createKey() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'My Key' }),
      })
      if (!res.ok) throw new Error('Failed to create key')
      const { key, meta } = await res.json()
      setNewKey(key)
      setKeys(prev => [{ ...meta, key_raw: key }, ...prev])
      setName('')
    } catch {
      setError('Failed to create key. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    const snapshot = keys
    setKeys(prev => prev.filter(k => k.id !== id))
    const res = await fetch(`/api/mcp-keys/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setKeys(snapshot)
      setError('Failed to revoke key.')
    }
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      {newKey && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-red-800">
            Key created — you can always copy it from the list below.
          </p>
          <div className="flex items-center gap-2">
            <pre className="flex-1 text-xs bg-white border border-red-200 rounded p-2 overflow-x-auto">
              {newKey}
            </pre>
            <button
              onClick={() => copyToClipboard(newKey, 'new')}
              title="Copy key"
              className="p-2 bg-red-800 text-white rounded hover:bg-red-700 shrink-0"
            >
              {copiedId === 'new' ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-xs text-red-600 underline hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Key name (e.g. My MacBook)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
          maxLength={100}
          onKeyDown={e => e.key === 'Enter' && createKey()}
        />
        <button
          onClick={createKey}
          disabled={creating}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-gray-500">No active keys. Create one above.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {keys.map(k => (
            <div key={k.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{k.name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{k.key_prefix}{'•'.repeat(28)}</p>
              </div>
              <div className="text-right shrink-0 space-y-0.5 whitespace-nowrap">
                <p className="text-xs text-gray-400">
                  Created {new Date(k.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-400">
                  {k.last_used_at
                    ? `Used ${new Date(k.last_used_at).toLocaleDateString()}`
                    : 'Never used'}
                </p>
              </div>
              {k.key_raw && (
                <button
                  onClick={() => copyToClipboard(k.key_raw!, k.id)}
                  title="Copy key"
                  className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-700 shrink-0"
                >
                  {copiedId === k.id ? <CheckIcon /> : <CopyIcon />}
                </button>
              )}
              <button
                onClick={() => revokeKey(k.id)}
                className="text-xs text-red-500 hover:text-red-700 shrink-0"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
