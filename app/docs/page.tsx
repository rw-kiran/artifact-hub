import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Docs — Artifact Hub',
  description: 'How to use Artifact Hub: features, MCP integration, and AI capabilities.',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">{title}</h2>
      {children}
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-gray-800 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 text-gray-800 text-sm px-1.5 py-0.5 rounded font-mono">
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 text-sm rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
      {children}
    </pre>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded font-mono mr-1">
      {label}
    </span>
  )
}

const TOC_ITEMS = [
  { id: 'overview', label: 'What is Artifact Hub' },
  { id: 'quickstart-web', label: 'Quick start — web' },
  { id: 'quickstart-mcp', label: 'Quick start — MCP' },
  { id: 'features', label: 'Features' },
  { id: 'mcp-tools', label: 'MCP tool reference' },
  { id: 'security', label: 'Security model' },
  { id: 'faq', label: 'FAQ & known limits' },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex gap-12">

          {/* Sidebar TOC */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-8">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">On this page</p>
              <nav className="flex flex-col gap-1">
                {TOC_ITEMS.map(({ id, label }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="text-sm text-gray-600 hover:text-gray-900 py-0.5"
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <div className="mt-8 pt-6 border-t">
                <p className="text-xs text-gray-400 mb-2">See also</p>
                <Link href="/docs/usecases" className="text-xs text-blue-600 hover:underline block">
                  Full use case matrix
                </Link>
                <Link href="/docs/architecture" className="text-xs text-blue-600 hover:underline block mt-1">
                  Architecture decisions
                </Link>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 flex flex-col gap-10">

            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Artifact Hub docs</h1>
              <p className="text-gray-600">Everything you need to publish, browse, share, and review AI-generated content.</p>
            </div>

            {/* Overview */}
            <Section id="overview" title="What is Artifact Hub">
              <p className="text-gray-700 mb-3">
                Artifact Hub is a platform for managing the lifecycle of AI-generated content — HTML pages,
                images, and PDFs. It gives teams a persistent, searchable home for content that otherwise
                ends up in blob storage with no browse, no feedback mechanism, and no access control
                beyond a raw expiring URL.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {[
                  { title: 'Publish', desc: 'Upload HTML, images, or PDFs. Claude auto-generates title, description, and tags.' },
                  { title: 'Browse', desc: 'Gallery with type and tag filters. Natural language search across all artifacts.' },
                  { title: 'Share', desc: 'Time-limited share links (1–168h). No sign-in required to view.' },
                  { title: 'Review', desc: 'Structured comments and star ratings. AI-generated consensus summary.' },
                  { title: 'MCP server', desc: 'Seven tools for Claude Desktop and Cursor to publish and manage artifacts conversationally.' },
                  { title: 'AI-native', desc: 'Auto-metadata, feedback summarization, and hybrid semantic search — all invisible.' },
                ].map(({ title, desc }) => (
                  <div key={title} className="border rounded-lg p-4">
                    <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
                    <p className="text-gray-600 text-sm">{desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Quick start — web */}
            <Section id="quickstart-web" title="Quick start — web UI">
              <ol className="list-none space-y-4">
                {[
                  {
                    n: '1',
                    title: 'Sign in',
                    body: <>Click <strong>Sign in</strong> in the top-right corner and authenticate with GitHub. Your account is created automatically on first sign-in.</>,
                  },
                  {
                    n: '2',
                    title: 'Upload an artifact',
                    body: <>Click <strong>Upload</strong> in the nav bar. Drop a <Code>.html</Code>, <Code>.png</Code>, <Code>.jpg</Code>, <Code>.gif</Code>, <Code>.webp</Code>, or <Code>.pdf</Code> file (max 50 MB). Claude generates the title, description, and tags automatically — edit them if needed.</>,
                  },
                  {
                    n: '3',
                    title: 'Browse and share',
                    body: <>The homepage shows all public artifacts. Click any artifact to open the detail view. Click <strong>Share</strong> to generate a time-limited link you can send to anyone.</>,
                  },
                ].map(({ n, title, body }) => (
                  <li key={n} className="flex gap-4">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center font-semibold">{n}</span>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{title}</p>
                      <p className="text-gray-600 text-sm mt-0.5">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>

            {/* Quick start — MCP */}
            <Section id="quickstart-mcp" title="Quick start — MCP (Claude Desktop / Cursor)">
              <ol className="list-none space-y-6">
                <li className="flex gap-4">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center font-semibold">1</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Generate an API key</p>
                    <p className="text-gray-600 text-sm mt-0.5">
                      Sign in, go to <Link href="/settings/mcp" className="text-blue-600 hover:underline">Settings → MCP</Link>, click <strong>Generate API Key</strong>. Name it and copy the key (shown once).
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center font-semibold">2</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Add to Claude Desktop config</p>
                    <p className="text-gray-600 text-sm mt-0.5 mb-2">Edit <Code>claude_desktop_config.json</Code> (on macOS: <Code>~/Library/Application Support/Claude/</Code>):</p>
                    <CodeBlock>{`{
  "mcpServers": {
    "artifact-hub": {
      "type": "http",
      "url": "https://artifact-hub.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}</CodeBlock>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center font-semibold">3</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Restart Claude Desktop</p>
                    <p className="text-gray-600 text-sm mt-0.5">You&apos;ll see &quot;artifact-hub&quot; in the tools list. Try: <em>&quot;Show me all artifacts&quot;</em> or <em>&quot;Publish this image: https://…&quot;</em></p>
                  </div>
                </li>
              </ol>
            </Section>

            {/* Features */}
            <Section id="features" title="Features">

              <SubSection title="Publish artifacts">
                <p className="text-gray-600 text-sm mb-3">
                  Upload any <Code>HTML</Code>, <Code>image</Code> (JPEG, PNG, GIF, WebP), or <Code>PDF</Code> up to 50 MB.
                  Files are stored on Vercel Blob and served via CDN.
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc ml-4">
                  <li><strong>Auto-metadata:</strong> Claude reads the content and generates title, description, and tags automatically after every upload</li>
                  <li><strong>Visibility:</strong> Public (visible to all) or Private (visible only to you). Default: public</li>
                  <li><strong>Edit metadata:</strong> Title, description, and tags are editable after upload via the artifact detail page</li>
                </ul>
              </SubSection>

              <SubSection title="Browse & search">
                <p className="text-gray-600 text-sm mb-3">
                  The homepage shows all public artifacts in reverse-chronological order.
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc ml-4">
                  <li><strong>Filter by type:</strong> HTML / Image / PDF buttons in the gallery header</li>
                  <li><strong>Filter by tag:</strong> Click any tag on a card to filter the gallery</li>
                  <li><strong>Natural language search:</strong> The search bar uses hybrid BM25 + semantic search — ask in plain English</li>
                  <li><strong>Private artifacts:</strong> Visible only to their owner when signed in; never returned in gallery or search for other users</li>
                </ul>
              </SubSection>

              <SubSection title="Share links">
                <p className="text-gray-600 text-sm mb-3">
                  Generate a time-limited link for any artifact from its detail page.
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc ml-4">
                  <li>Expiry: 1 hour to 168 hours (7 days). Default: 24 hours</li>
                  <li>Share links require no sign-in — anyone with the URL can view the artifact</li>
                  <li>Expired links return 404</li>
                  <li>Share tokens are cryptographically random (32 bytes, hex-encoded)</li>
                </ul>
              </SubSection>

              <SubSection title="Feedback & ratings">
                <p className="text-gray-600 text-sm mb-3">
                  Any signed-in user can leave structured feedback on any public artifact.
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc ml-4">
                  <li>Free-text comment field</li>
                  <li>Optional 1–5 star rating</li>
                  <li><strong>AI summary:</strong> After each new comment, Claude generates a 2–3 sentence consensus summary, shown above the comment thread</li>
                  <li>Summary shows &quot;Not enough feedback yet&quot; until at least 2 comments exist</li>
                </ul>
              </SubSection>

              <SubSection title="AI features">
                <div className="space-y-4">
                  {[
                    {
                      name: 'Auto-metadata',
                      when: 'Fires after every upload',
                      what: 'Claude reads the artifact content (strips HTML tags, base64-encodes PDFs/images) and returns structured title, description, and tags. Results are stored to the DB and appear on the detail page within seconds.',
                    },
                    {
                      name: 'Feedback summary',
                      when: 'Fires after every new comment',
                      what: 'Claude reads all comments for an artifact and writes a 2–3 sentence summary of the consensus. Runs asynchronously — the submit action returns immediately. The summary is cached and only regenerated when new feedback arrives.',
                    },
                    {
                      name: 'Hybrid NL search',
                      when: 'Fires on every search query',
                      what: 'Queries are embedded via Google text-embedding-004 (1536d). The hybrid_search() Postgres RPC runs BM25 full-text and cosine similarity in parallel. Claude reranks results when candidates exceed the limit. Falls back to Postgres full-text search if embedding fails.',
                    },
                  ].map(({ name, when, what }) => (
                    <div key={name} className="border-l-2 border-gray-200 pl-4">
                      <p className="font-semibold text-sm text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500 mb-1">{when}</p>
                      <p className="text-sm text-gray-600">{what}</p>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* MCP tool reference */}
            <Section id="mcp-tools" title="MCP tool reference">
              <p className="text-sm text-gray-600 mb-4">
                All tools are available at <Code>POST /api/mcp</Code>. Authenticate with <Code>Authorization: Bearer &lt;api-key&gt;</Code>.
              </p>
              <div className="space-y-5">
                {[
                  {
                    name: 'publish_artifact',
                    params: ['url: string', 'title?: string', 'description?: string', 'tags?: string[]', 'visibility?: "public" | "private"'],
                    desc: 'Fetch a file from a public URL, validate MIME type, store to Vercel Blob, create artifact record, and auto-generate metadata.',
                  },
                  {
                    name: 'list_artifacts',
                    params: ['type?: "html" | "image" | "pdf"', 'tag?: string', 'limit?: number'],
                    desc: 'Browse public artifacts with optional type/tag filters. Returns id, title, description, tags, type, created_at.',
                  },
                  {
                    name: 'get_artifact',
                    params: ['artifact_id?: string (UUID)', 'title?: string', 'tags?: string[]'],
                    desc: 'Fetch full artifact including feedback thread and AI summary. Returns candidates list when title is ambiguous.',
                  },
                  {
                    name: 'search_artifacts',
                    params: ['query: string', 'limit?: number'],
                    desc: 'Natural language search using hybrid BM25 + semantic pipeline. Falls back to full-text search if embedding fails.',
                  },
                  {
                    name: 'share_artifact',
                    params: ['artifact_id?: string', 'query?: string', 'expires_in_hours?: number (1–168)'],
                    desc: 'Generate a time-limited share URL. Returns candidates list when query matches multiple artifacts.',
                  },
                  {
                    name: 'add_feedback',
                    params: ['artifact_id: string', 'content: string', 'rating?: number (1–5)'],
                    desc: 'Post a comment and optional rating. Triggers AI feedback summary regeneration in the background.',
                  },
                  {
                    name: 'summarize_feedback',
                    params: ['artifact_id: string'],
                    desc: 'Return the cached AI summary or trigger regeneration. Returns "Not enough feedback yet" if fewer than 2 comments.',
                  },
                ].map(({ name, params, desc }) => (
                  <div key={name} className="border rounded-lg p-4">
                    <p className="font-mono text-sm font-semibold text-gray-900 mb-1">{name}</p>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {params.map(p => <Badge key={p} label={p} />)}
                    </div>
                    <p className="text-sm text-gray-600">{desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Security model */}
            <Section id="security" title="Security model">
              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Visibility and access control</p>
                  <p>Artifact visibility is enforced at the database layer via Postgres Row-Level Security (RLS). Private artifacts are invisible to any query that doesn&apos;t carry the owner&apos;s auth token — this includes gallery, search, and direct ID lookup. There is no API-layer check that can be bypassed by a crafted request.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Share link security</p>
                  <p>Share tokens are 32 cryptographically random bytes (hex-encoded, 64 characters). They are not sequential and cannot be guessed. They expire at a precise timestamp and are rejected after expiry.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">MCP authentication</p>
                  <p>Every MCP request requires a valid API key in the <Code>Authorization</Code> header. Keys are compared using <Code>timingSafeEqual</Code> to prevent timing attacks. Per-user keys are stored as SHA-256 hashes — the plaintext is shown once at creation and never stored.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">File upload safety</p>
                  <p>MIME type is validated server-side against a whitelist (<Code>text/html</Code>, <Code>image/*</Code>, <Code>application/pdf</Code>) — extension spoofing is rejected. Max file size is 50 MB.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">SSRF prevention</p>
                  <p>The MCP <Code>publish_artifact</Code> tool fetches URLs on your behalf. Every redirect hop is validated against private IP ranges (RFC 1918, link-local, loopback) before following, preventing server-side request forgery.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Known limitation: blob URL privacy</p>
                  <p>Files are stored on Vercel Blob (free tier), which serves all files on a public CDN. Private artifacts are protected at the gallery/API/RLS layer, but if a blob URL is leaked externally, the file itself is accessible. For sensitive content, treat blob URLs as secrets.</p>
                </div>
              </div>
            </Section>

            {/* FAQ */}
            <Section id="faq" title="FAQ & known limits">
              <div className="space-y-5">
                {[
                  {
                    q: 'Can I upload a file from my local disk via MCP?',
                    a: 'No — the MCP protocol has no binary transport. Host the file publicly first (e.g. paste it into an S3 bucket, GitHub Gist, or any public URL), then call publish_artifact(url=…).',
                  },
                  {
                    q: 'Can I edit an artifact\'s content after uploading?',
                    a: 'You can edit the metadata (title, description, tags) via the detail page. Re-uploading file content creates a new artifact — there is no versioning today.',
                  },
                  {
                    q: 'Can I delete an artifact or comment through MCP?',
                    a: 'No — destructive operations are web-UI only. Deleting artifacts and comments via chat is risky when inputs are ambiguous. Use the artifact detail page.',
                  },
                  {
                    q: 'Can I upload images generated by Claude directly?',
                    a: 'No — Claude cannot push binary data over MCP. Save the image to a hosting URL first (e.g. Imgur, Cloudinary, S3), then publish_artifact(url=…).',
                  },
                  {
                    q: 'Who can see private artifacts?',
                    a: 'Only the user who created them, when signed in. Private artifacts are excluded from gallery, search results, and share-by-ID lookups for all other users. RLS enforces this at the DB layer.',
                  },
                  {
                    q: 'What AI model powers the features?',
                    a: 'Claude Sonnet 4.6 (claude-sonnet-4-6) for auto-metadata, feedback summaries, content extraction, and search reranking. Google text-embedding-004 for semantic embeddings.',
                  },
                  {
                    q: 'How do I revoke an MCP API key?',
                    a: 'Go to Settings → MCP and click Revoke next to the key. Revoked keys are rejected immediately on the next request.',
                  },
                ].map(({ q, a }) => (
                  <div key={q}>
                    <p className="font-semibold text-gray-900 text-sm">{q}</p>
                    <p className="text-gray-600 text-sm mt-1">{a}</p>
                  </div>
                ))}
              </div>
            </Section>

          </main>
        </div>
      </div>
    </div>
  )
}
