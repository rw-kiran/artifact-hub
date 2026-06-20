'use client'

import { useState } from 'react'
import type { ShareToken } from '@/lib/types'

export function ShareModal({ artifactId }: { artifactId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [hours, setHours] = useState(24)
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [links, setLinks] = useState<ShareToken[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadLinks() {
    const res = await fetch(`/api/share?artifact_id=${artifactId}`)
    if (res.ok) {
      const json = await res.json() as { tokens: ShareToken[] }
      setLinks(json.tokens)
    }
  }

  async function open() {
    setIsOpen(true)
    await loadLinks()
  }

  async function generate() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact_id: artifactId, expires_in_hours: hours }),
    })
    setLoading(false)
    if (res.ok) {
      const json = await res.json() as { url: string }
      setGeneratedUrl(json.url)
      await loadLinks()
    } else {
      setError('Failed to generate link. Please try again.')
    }
  }

  async function revoke(tokenId: string) {
    setError(null)
    const res = await fetch(`/api/share?token_id=${tokenId}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Failed to revoke link. Please try again.')
      return
    }
    // Clear generated URL if it belonged to the revoked token
    const revoked = links.find((l) => l.id === tokenId)
    if (revoked && generatedUrl.includes(revoked.token)) setGeneratedUrl('')
    await loadLinks()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ponytail: clipboard blocked (HTTP / permission denied) — fall back to selection
      document.querySelector<HTMLInputElement>('[aria-label="Share URL"]')?.select()
    }
  }

  function hoursUntil(expiresAt: string) {
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000)
  }

  return (
    <>
      <button
        onClick={open}
        className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        Share
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="share-modal-title" className="text-lg font-semibold">Share artifact</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <label className="sr-only" htmlFor="expires-hours">Expires in (hours)</label>
              <input
                id="expires-hours"
                type="number"
                min={1}
                max={168}
                value={hours}
                onChange={(e) =>
                  setHours(Math.min(168, Math.max(1, parseInt(e.target.value, 10) || 24)))
                }
                className="w-20 border rounded px-2 py-1.5 text-sm"
              />
              <span className="self-center text-sm text-gray-500">hours</span>
              <button
                onClick={generate}
                disabled={loading}
                className="ml-auto text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate link'}
              </button>
            </div>

            {generatedUrl && (
              <div className="flex gap-2 mb-6">
                <input
                  readOnly
                  value={generatedUrl}
                  className="flex-1 border rounded px-2 py-1.5 text-xs bg-gray-50 font-mono"
                  aria-label="Share URL"
                />
                <button
                  onClick={copy}
                  className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 whitespace-nowrap"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}

            {links.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                  Active links
                </p>
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 font-mono text-xs truncate flex-1">
                        …{link.token.slice(-8)}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0">
                        {hoursUntil(link.expires_at)}h left
                      </span>
                      <button
                        onClick={() => revoke(link.id)}
                        className="text-red-500 hover:text-red-700 text-xs shrink-0"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
