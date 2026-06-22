import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Architecture & Decisions — Artifact Hub Docs',
  description: 'Engineering rationale for every stack choice in Artifact Hub.',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">{title}</h2>
      {children}
    </section>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 text-gray-800 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 text-sm rounded-lg p-4 overflow-x-auto font-mono leading-relaxed whitespace-pre">
      {children}
    </pre>
  )
}

function DecisionCard({
  tech,
  versus,
  why,
  tradeoff,
}: {
  tech: string
  versus: string
  why: string[]
  tradeoff: string
}) {
  return (
    <div className="border rounded-lg p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="font-semibold text-gray-900">{tech}</p>
        <p className="text-xs text-gray-400 shrink-0">vs. {versus}</p>
      </div>
      <ul className="space-y-1 text-sm text-gray-600 list-disc ml-4">
        {why.map(w => <li key={w}>{w}</li>)}
      </ul>
      <div className="pt-2 border-t">
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Trade-off: </span>
        <span className="text-xs text-gray-600">{tradeoff}</span>
      </div>
    </div>
  )
}

const TOC = [
  { id: 'overview', label: 'System overview' },
  { id: 'stack', label: 'Stack decisions' },
  { id: 'design', label: 'Key design decisions' },
  { id: 'limits', label: 'Known limitations' },
]

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-6">
          <Link href="/docs" className="text-sm text-blue-600 hover:underline">← Back to docs</Link>
        </div>

        <div className="flex gap-12">

          {/* Sidebar */}
          <aside className="hidden lg:block w-48 shrink-0">
            <div className="sticky top-8">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">On this page</p>
              <nav className="flex flex-col gap-1">
                {TOC.map(({ id, label }) => (
                  <a key={id} href={`#${id}`} className="text-sm text-gray-600 hover:text-gray-900 py-0.5">
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 flex flex-col gap-10">

            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Architecture & Technical Decisions</h1>
              <p className="text-gray-600 text-sm">Engineering rationale for every stack choice. Includes alternatives considered and known ceilings.</p>
            </div>

            <Section id="overview" title="System overview">
              <CodeBlock>{`┌──────────────────────────────────────────────────────────┐
│  Client (Browser / Claude Desktop / Cursor)              │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼──────────────────────────────────┐
│  Vercel (Edge + Serverless)                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Next.js 15 App Router                             │ │
│  │  ├── Middleware (rate limit + auth guard)           │ │
│  │  ├── Server Components (pages, layouts)             │ │
│  │  ├── Client Components (forms, modals, nav)         │ │
│  │  └── API Routes (/api/*)                           │ │
│  └─────────────────────────────────────────────────────┘ │
└──────┬──────────┬─────────┬──────────┬───────────────────┘
       │          │         │          │
  Supabase   Vercel Blob  Anthropic  Google AI
  (Postgres  (file CDN)  (Claude    (embeddings)
   + Auth              Sonnet 4.6)
   + RLS)
       │
  Langfuse (LLM traces, async)`}</CodeBlock>

              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Upload flow</p>
                  <CodeBlock>{`Browser → POST /api/upload (MIME+size check) → Vercel Blob
        → POST /api/artifacts (DB record)
        → background: extractContent → generateMetadata → UPDATE artifacts`}</CodeBlock>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">MCP flow</p>
                  <CodeBlock>{`Claude Desktop → POST /api/mcp (Bearer auth → per-user key lookup)
               → AsyncLocalStorage sets userId
               → tool dispatch → Supabase (service role) / Vercel Blob / Claude`}</CodeBlock>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Search flow</p>
                  <CodeBlock>{`GET /api/search?q=... → embedTexts() → hybrid_search() RPC (BM25 + cosine)
                    → [if candidates > limit] Claude reranker → results`}</CodeBlock>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-800 mb-3">Core DB tables</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Table</th>
                        <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Key columns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['artifacts', 'id, title, description, tags[], type, blob_url, created_by, visibility, search_vector (tsvector), feedback_summary, index_status'],
                        ['feedback', 'id, artifact_id, author_email, content, rating (1–5)'],
                        ['share_tokens', 'id, artifact_id, token (hex-32), expires_at'],
                        ['mcp_api_keys', 'id, user_id, name, key_prefix, key_hash (SHA-256), revoked_at'],
                        ['artifact_chunks', 'id, artifact_id, chunk_index, content, embedding (vector 1536d)'],
                      ].map(([table, cols]) => (
                        <tr key={table} className="hover:bg-gray-50">
                          <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-900 align-top whitespace-nowrap">{table}</td>
                          <td className="px-3 py-2 border border-gray-200 text-xs text-gray-600">{cols}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            <Section id="stack" title="Stack decisions">
              <div className="flex flex-col gap-4">
                <DecisionCard
                  tech="Next.js 15 App Router"
                  versus="Remix, Astro, plain Express + React SPA"
                  why={[
                    'Vercel-native: zero-config serverless, preview URLs per PR, Edge middleware',
                    'Server Components cut the client JS bundle — gallery and viewer pages ship almost no JS',
                    'File-system routing maps cleanly to required URL structure',
                    'after() (Next.js 15) fires async work after the response is sent — no background job queue needed for metadata generation and feedback summary',
                  ]}
                  tradeoff="App Router is newer with sharper edges than Pages Router. 'use client' boundary management requires attention. Acceptable given Vercel's first-party support."
                />
                <DecisionCard
                  tech="Supabase (PostgreSQL + Auth + RLS)"
                  versus="Neon + Auth0, PlanetScale + Clerk, plain Postgres + NextAuth"
                  why={[
                    'Bundles Auth, DB, and RLS in one service — no separate auth provider to integrate',
                    'GitHub OAuth in 10 minutes via the dashboard',
                    'RLS lets the DB enforce access control — private artifacts are invisible at the query layer, not just the API layer',
                    'pgvector extension available on free tier — no separate vector store',
                    'auth.uid() available inside RLS policies — ownership checks are native',
                  ]}
                  tradeoff="Free tier has connection limits and cold-start latency. Fine for the current scale; connection pooling (Supavisor) for production multi-instance."
                />
                <DecisionCard
                  tech="Vercel Blob"
                  versus="AWS S3, Cloudinary, Uploadthing, Supabase Storage"
                  why={[
                    'Zero config when deploying to Vercel — one env var',
                    'Files served from Vercel CDN immediately after put()',
                    'No separate CloudFront setup or bucket policy management',
                  ]}
                  tradeoff="Free tier blobs are public CDN only. Private artifacts are protected at the API/RLS layer but blob URLs are guessable if leaked. Vercel Blob protected URLs (paid) would close this gap."
                />
                <DecisionCard
                  tech="pgvector + hybrid search (BM25 + cosine)"
                  versus="Pinecone, Weaviate, Qdrant, Elasticsearch"
                  why={[
                    'pgvector is a Postgres extension — no separate service, no network hop, no sync lag',
                    'Hybrid search outperforms either alone: BM25 catches exact title matches; semantic catches intent-based queries',
                    'Claude reranker as third pass covers edge cases where scores are close',
                    'Everything in one DB — no eventual consistency between artifact record and embeddings',
                  ]}
                  tradeoff="Postgres isn't purpose-built for vector search. At millions of artifacts a dedicated store with service-level HNSW tuning would be faster. Postgres HNSW index is fast enough at current scale."
                />
                <DecisionCard
                  tech="EdgeFastMCP / fastmcp"
                  versus="Raw @modelcontextprotocol/sdk HTTP transport"
                  why={[
                    'Simpler tool registration API — server.tool(name, schema, handler) — removes ~200 lines of boilerplate',
                    'Edge-compatible: no Node-only APIs, runs in Vercel Edge Functions',
                    'StreamableHTTPServerTransport is stateless — each request independent, serverless-compatible',
                  ]}
                  tradeoff="fastmcp drops some Zod constraints at the transport layer (e.g. z.string().uuid() isn't enforced by MCP SDK). Compensated with assertUuid() in lib/mcp/utils.ts."
                />
                <DecisionCard
                  tech="Langfuse"
                  versus="Custom logging, Helicone, LangSmith, OpenTelemetry direct"
                  why={[
                    'Free tier with generous trace limits',
                    'Traces every Claude call with input, output, latency, token count',
                    'Conditional initialization — skips gracefully if keys are missing in local dev',
                    'Captures all four Claude call types: metadata, feedback summary, content extraction, search reranking',
                  ]}
                  tradeoff="Adds ~100ms async flushing after each LLM call (langfuse.flushAsync()). Non-blocking for user response. Acceptable."
                />
                <DecisionCard
                  tech="Google AI API (text-embedding-004)"
                  versus="Anthropic embeddings, OpenAI embeddings, Cohere"
                  why={[
                    'Anthropic has no public embeddings API (as of build date)',
                    'Fast, cheap, available without a separate account',
                    '768-dimensional output, upcast to 1536d for pgvector compatibility',
                  ]}
                  tradeoff="Mixing Claude for generation and Google for embeddings adds a second provider dependency. Migrating lib/ai/embed.ts is a one-file change if Anthropic ships embeddings."
                />
                <DecisionCard
                  tech="Tailwind CSS v4"
                  versus="Tailwind v3, CSS Modules, styled-components"
                  why={[
                    'Single @import "tailwindcss" in globals.css — no tailwind.config.js needed',
                    'No JS-in-CSS runtime — important for Server Components',
                    'v4 + PostCSS is Vercel-native',
                  ]}
                  tradeoff="v4 is newer; some third-party component libraries still depend on v3 class names. Not an issue since all components are written from scratch."
                />
              </div>
            </Section>

            <Section id="design" title="Key design decisions">
              <div className="space-y-6 text-sm">
                {[
                  {
                    title: 'RLS over middleware for authorization',
                    body: 'Middleware guards the upload page and API routes. But the actual data filter — "only return my private artifacts" — lives in Postgres RLS. This means a future bug that bypasses the API auth check still can\'t expose private data. The search RPC inherits RLS automatically; no explicit filter needed.',
                  },
                  {
                    title: 'Service role in MCP',
                    body: 'The MCP server uses the Supabase service role key (bypasses RLS). The trade-off is deliberate: the MCP layer is already authenticated (per-user API keys, timing-safe comparison). AsyncLocalStorage threads userId into every write — created_by and author_* are set from the authenticated identity, not tool input. The alternative (anon key + user JWT via MCP) has no standard mechanism.',
                  },
                  {
                    title: 'Per-user MCP API keys',
                    body: <>A single <Code>MCP_API_KEY</Code> env var works for local dev. In production, every user generates their own key at /settings/mcp. Why: revocation is per-user and immediate; last_used_at tracks active clients; artifacts published via MCP are attributed to the correct user; a leaked key only exposes that user&apos;s identity.</>,
                  },
                  {
                    title: 'In-memory rate limiting',
                    body: <>Middleware rate-limits AI routes at 20 req/min per IP using a <Code>Map</Code>. Works per-function-instance — under Vercel concurrency, multiple instances means the cap isn&apos;t globally enforced. Noted with a ponytail comment in middleware.ts. Upgrade path: swap <Code>checkRateLimit</Code> for <Code>@upstash/ratelimit</Code> + Upstash Redis. One-hour change.</>,
                  },
                  {
                    title: 'after() for async feedback summary',
                    body: <>When feedback is submitted, <Code>summarizeFeedback()</Code> runs via Next.js <Code>after()</Code> — fires after the 201 response is sent. Keeps submit latency at ~50ms (just the DB write), not ~1500ms (DB write + Claude call). A background job queue (Inngest, Trigger.dev) would add a dependency and complexity. <Code>after()</Code> is the right scope for a task that takes &lt;5 seconds with no retry requirement.</>,
                  },
                  {
                    title: 'Sandbox for HTML artifact viewer',
                    body: 'HTML artifacts render in a sandboxed iframe with allow-scripts but allow-same-origin denied. This allows interactive HTML content (charts, animations) while preventing the artifact from accessing cookies, localStorage, or making credentialed requests back to the app.',
                  },
                ].map(({ title, body }) => (
                  <div key={title} className="border-l-2 border-gray-200 pl-4">
                    <p className="font-semibold text-gray-900 mb-1">{title}</p>
                    <p className="text-gray-600">{body}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="limits" title="Known limitations & upgrade paths">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Limitation</th>
                      <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Impact</th>
                      <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">Upgrade path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['In-memory rate limiting', 'Ineffective across multiple Vercel instances', '@upstash/ratelimit + Upstash Redis'],
                      ['Vercel Blob public CDN', 'Private artifact URLs guessable if leaked', 'Vercel Blob protected URLs (paid) or proxy reads'],
                      ['No artifact versioning', 'Re-upload creates a new artifact', 'Add parent_artifact_id FK + version chain'],
                      ['No binary MCP uploads', 'Local files can\'t be published via MCP', 'Protocol limitation; no workaround until MCP adds binary transport'],
                      ['Google embeddings', 'Two API providers to maintain', 'Migrate lib/ai/embed.ts if Anthropic ships embeddings'],
                      ['No email notifications', 'Owner unaware of new feedback', 'Add Resend/Postmark + created_by email lookup'],
                      ['Single-tenant auth', 'No org/team model', 'Add organizations table, team membership, org-scoped RLS'],
                    ].map(([lim, impact, upgrade]) => (
                      <tr key={lim} className="hover:bg-gray-50">
                        <td className="px-3 py-2 border border-gray-200 text-gray-900 align-top font-medium">{lim}</td>
                        <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{impact}</td>
                        <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{upgrade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

          </main>
        </div>
      </div>
    </div>
  )
}
