'use client'

import { useState } from 'react'

type Tab = 'claude' | 'cursor' | 'chatgpt'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

function snippet(tab: Tab) {
  if (tab === 'chatgpt') return null
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

  const code = snippet(tab)

  async function copy() {
    if (!code) return
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'claude', label: 'Claude Desktop' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'chatgpt', label: 'ChatGPT' },
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
            <button onClick={copy} className="absolute top-2 right-2 text-xs px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-50">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500">Replace <code className="bg-gray-100 px-1 rounded">YOUR_API_KEY</code> with the key you created above, then fully restart Claude Desktop.</p>
        </div>
      )}

      {tab === 'cursor' && (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Open <code className="bg-gray-100 px-1 rounded text-xs">~/.cursor/mcp.json</code> (create it if it doesn't exist) and add:
          </p>
          <div className="relative">
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{code}</pre>
            <button onClick={copy} className="absolute top-2 right-2 text-xs px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-50">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500">Replace <code className="bg-gray-100 px-1 rounded">YOUR_API_KEY</code> with the key you created above, then restart Cursor.</p>
        </div>
      )}

      {tab === 'chatgpt' && (
        <div className="space-y-3 text-sm text-gray-700">
          <p>ChatGPT doesn't currently support MCP natively.</p>
          <p className="text-gray-500">Use Claude Desktop or Cursor instead — both support the MCP protocol and work with the config above.</p>
        </div>
      )}
    </div>
  )
}
