import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { McpKeysPanel } from '@/components/McpKeysPanel'
import { McpSetupGuide } from '@/components/McpSetupGuide'
import type { McpApiKey } from '@/lib/types'

export default async function McpSettingsPage() {
  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient(cookieStore).auth.getUser()
  if (!user) redirect('/auth/signin?next=/settings/mcp')

  const supabase = createServerSupabaseClient()
  const { data: keys } = await supabase
    .from('mcp_api_keys')
    .select('id, name, key_prefix, key_raw, created_at, last_used_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  return (
    <main className="max-w-2xl mx-auto px-4 py-12 space-y-12">
      <div>
        <h1 className="text-2xl font-bold">MCP Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create API keys to connect Artifact Hub to Claude Desktop, Cursor, and other MCP-compatible tools.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Your API Keys</h2>
        <McpKeysPanel initialKeys={(keys ?? []) as McpApiKey[]} />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Connect to your tools</h2>
        <McpSetupGuide />
      </section>
    </main>
  )
}
