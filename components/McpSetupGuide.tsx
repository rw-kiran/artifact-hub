'use client'

import { useState } from 'react'

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

type Tab = 'claude' | 'cursor'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

function snippet() {
  return JSON.stringify(
    {
      mcpServers: {
        'artifact-hub': {
          command: 'npx',
          args: [
            'mcp-remote',
            `${APP_URL}/api/mcp`,
            '--header',
            'Authorization: Bearer YOUR_API_KEY',
          ],
        },
      },
    },
    null,
    2,
  )
}

export function McpSetupGuide() {
  const [tab, setTab] = useState<Tab>('claude')
  const [copied, setCopied] = useState(false)

  const code = snippet()

  async function copy() {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'claude', label: 'Claude Desktop' },
    { id: 'cursor', label: 'Cursor' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-100">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'claude' && (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Open <code className="bg-gray-100 px-1 rounded text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</code> and add:
          </p>
          <div className="relative">
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{code}</pre>
            <button onClick={copy} title="Copy config" className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-700">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <p className="text-xs text-gray-500">Replace <code className="bg-gray-100 px-1 rounded">YOUR_API_KEY</code> with a key from above (use the Copy button), then fully restart Claude Desktop.</p>
        </div>
      )}

      {tab === 'cursor' && (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Open <code className="bg-gray-100 px-1 rounded text-xs">~/.cursor/mcp.json</code> (create it if it doesn't exist) and add:
          </p>
          <div className="relative">
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{code}</pre>
            <button onClick={copy} title="Copy config" className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-700">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <p className="text-xs text-gray-500">Replace <code className="bg-gray-100 px-1 rounded">YOUR_API_KEY</code> with a key from above, then restart Cursor.</p>
        </div>
      )}
    </div>
  )
}
