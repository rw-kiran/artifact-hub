import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Use Case Matrix — Artifact Hub Docs',
  description: 'All product surfaces, web UI flows, AI features, and MCP tool chains for Artifact Hub.',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">{title}</h2>
      {children}
    </section>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 border border-gray-200 text-gray-700 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 text-gray-800 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>
}

export default function UseCasesPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-6">
          <Link href="/docs" className="text-sm text-blue-600 hover:underline">← Back to docs</Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Feature Coverage & Use Cases</h1>
          <p className="text-gray-600">All product surfaces, web UI flows, AI features, and MCP tool chains.</p>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-mono text-gray-500">
            {['publish_artifact', 'list_artifacts', 'get_artifact', 'search_artifacts', 'share_artifact', 'add_feedback', 'summarize_feedback'].map(t => (
              <span key={t} className="bg-gray-100 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-10">

          <Section id="overview" title="What is Artifact Hub">
            <p className="text-gray-700 text-sm mb-2">
              Artifact Hub is a platform for managing the lifecycle of AI-generated content — HTML pages, images, and PDFs.
              It provides a persistent, searchable home for content that otherwise ends up in blob storage with no browse,
              no feedback mechanism, and no access control beyond a raw expiring URL.
            </p>
            <p className="text-gray-700 text-sm">
              <strong>Who it&apos;s for:</strong> Product and engineering teams who generate AI output (mockups, reports,
              dashboards, presentations) and need a structured way to manage its lifecycle — from publishing to review to
              sharing with stakeholders.
            </p>
          </Section>

          <Section id="web-ui" title="Web UI flows">
            <div className="space-y-5 text-sm text-gray-700">
              {[
                {
                  title: 'Publish an artifact',
                  steps: [
                    'Sign in with GitHub',
                    'Navigate to Upload (/artifacts/upload)',
                    'Drop a file — supports .html, .png, .jpg, .gif, .webp, .pdf (max 50 MB)',
                    'Click Upload artifact',
                    'System stores to Vercel Blob, creates DB record, triggers Claude metadata generation',
                    'Land on artifact detail page with auto-populated title, description, and tags',
                  ],
                },
                {
                  title: 'Browse the gallery',
                  steps: [
                    'Homepage (/) shows all public artifacts in reverse-chronological order',
                    'Filter by type: HTML / Image / PDF buttons',
                    'Filter by tag: click any tag card',
                    'Search bar: natural language search (see AI Features)',
                    'Pagination: 20 artifacts per page',
                  ],
                },
                {
                  title: 'Share an artifact',
                  steps: [
                    'Open artifact detail page',
                    'Click Share — modal appears',
                    'Set expiry: 1 hour to 168 hours (default 24h)',
                    'Click Generate link',
                    'Share URL (/share/[token]) works without authentication',
                    'After expiry the link returns 404',
                  ],
                },
                {
                  title: 'Leave feedback',
                  steps: [
                    'Open artifact detail page',
                    'Scroll to Feedback panel',
                    'Write a comment and optionally set 1–5 star rating',
                    'Click Submit',
                    'AI summary above the thread updates within a few seconds',
                  ],
                },
                {
                  title: 'Manage MCP API keys',
                  steps: [
                    'Navigate to Settings (/settings/mcp)',
                    'Click Generate API Key — name it and copy (shown once)',
                    'Add to Claude Desktop or Cursor config (setup snippet shown on page)',
                    'Revoke keys anytime — rejected immediately on next request',
                  ],
                },
              ].map(({ title, steps }) => (
                <div key={title}>
                  <p className="font-semibold text-gray-900 mb-1">{title}</p>
                  <ol className="list-decimal ml-5 space-y-0.5 text-gray-600">
                    {steps.map(s => <li key={s}>{s}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          </Section>

          <Section id="ai-features" title="AI features">
            <div className="space-y-5">
              {[
                {
                  name: 'Auto-metadata on upload',
                  when: 'Fires after every upload',
                  how: 'Claude reads content (HTML: strip tags; PDF: base64 doc block; image: vision block) and returns structured { title, description, tags }. Written back to the artifact record.',
                  impact: 'Artifact detail page shows meaningful metadata without manual input. Users edit it ~10% of the time.',
                },
                {
                  name: 'Feedback summary',
                  when: 'Fires after every new comment (async via after())',
                  how: 'Claude reads all comments for the artifact and writes 2–3 sentences summarizing the consensus. Stored as feedback_summary on the artifact.',
                  impact: 'Shows "Not enough feedback yet" until ≥2 comments. Summary sits above the thread — answers "is this approved?" at a glance.',
                },
                {
                  name: 'Hybrid NL search',
                  when: 'Fires on every search query',
                  how: 'Query embedded via Google text-embedding-004. hybrid_search() RPC runs BM25 full-text + cosine similarity in parallel. Claude reranks when candidates exceed limit. Falls back to Postgres FTS if embedding fails.',
                  impact: '"Find the revenue report from last quarter" works without knowing exact title or tags.',
                },
              ].map(({ name, when, how, impact }) => (
                <div key={name} className="border-l-2 border-gray-200 pl-4">
                  <p className="font-semibold text-gray-900 text-sm">{name}</p>
                  <p className="text-xs text-gray-500 mb-1">{when}</p>
                  <p className="text-sm text-gray-600 mb-1"><span className="font-medium text-gray-700">How:</span> {how}</p>
                  <p className="text-sm text-gray-600"><span className="font-medium text-gray-700">Impact:</span> {impact}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="single-tool" title="Single tool use cases">
            <Table
              headers={['Use case', 'Prompt example', 'Tool']}
              rows={[
                ['Browse the gallery', '"Show me all artifacts"', 'list_artifacts'],
                ['Browse by type', '"List all PDFs"', 'list_artifacts(type=pdf)'],
                ['Browse by tag', '"What has the \'design\' tag?"', 'list_artifacts(tag=design)'],
                ['Keyword / NL search', '"Find artifacts about dashboards"', 'search_artifacts'],
                ['Publish from URL', '"Publish this image: https://…"', 'publish_artifact'],
                ['Publish with metadata', '"Publish this HTML as \'Q4 Dashboard\', tag it \'finance\'"', 'publish_artifact(title, tags)'],
              ]}
            />
          </Section>

          <Section id="two-step" title="2-step chains">
            <Table
              headers={['Use case', 'Prompt example', 'Tool chain']}
              rows={[
                ['Look up artifact details', '"Tell me about the Pikachu artifact"', 'search_artifacts → get_artifact'],
                ['Look up by title', '"Get me the landing page artifact"', 'get_artifact(title=…)'],
                ['Share a specific artifact', '"Share the landing page artifact"', 'share_artifact(query=…)'],
                ['Leave a review', '"Give 4 stars to the data viz artifact"', 'search_artifacts → add_feedback'],
                ['Read AI summary', '"What do people think about the chart?"', 'search_artifacts → summarize_feedback'],
                ['Publish then share', '"Publish this PDF and send me a link"', 'publish_artifact → share_artifact'],
                ['Publish then annotate', '"Publish this mockup, note it needs a11y work"', 'publish_artifact → add_feedback'],
                ['Check rating of latest', '"What\'s the feedback on the newest artifact?"', 'list_artifacts(limit=1) → summarize_feedback'],
              ]}
            />
          </Section>

          <Section id="multi-step" title="Multi-step flows">
            <Table
              headers={['Use case', 'Prompt example', 'Tool chain']}
              rows={[
                ['Publish → review → share', '"Upload this mockup, rate it 5 stars, share with team"', 'publish_artifact → add_feedback → share_artifact'],
                ['Curated recommendations', '"Find good HTML artifacts and pick the top-rated"', 'list_artifacts → get_artifact → summarize_feedback'],
                ['Peer review workflow', '"Find the report artifact, review it, show the summary"', 'search_artifacts → get_artifact → add_feedback → summarize_feedback'],
                ['Share with expiry', '"Find the Q4 report, create a 48h link for Slack"', 'search_artifacts → share_artifact(expires_in_hours=48)'],
                ['Publish batch', '"Publish these 3 images: [url1] [url2] [url3]"', 'publish_artifact × 3 in sequence'],
                ['Browse → compare → pick', '"Show all PDFs, read the top 3, pick best feedback"', 'list_artifacts → get_artifact × 3 → summarize_feedback × 3'],
              ]}
            />
          </Section>

          <Section id="hitl" title="Human-in-the-loop (ambiguous inputs)">
            <Table
              headers={['Trigger', 'What Claude does', 'Tool behavior']}
              rows={[
                [
                  'Vague name matches multiple',
                  '"Share the report" → 4 artifacts have "report" in title',
                  'share_artifact returns candidates list → Claude asks to pick → re-calls with artifact_id',
                ],
                [
                  'Title search returns multiple',
                  '"Get me the dashboard artifact" → 3 matches',
                  'get_artifact returns candidates → Claude asks to confirm',
                ],
                [
                  'No identifier given',
                  '"Share an artifact" with no context',
                  'share_artifact returns clarification prompt',
                ],
              ]}
            />
          </Section>

          <Section id="gaps" title="Coverage gaps (no MCP tool today)">
            <Table
              headers={['Missing use case', 'What would be needed', 'Workaround']}
              rows={[
                ['Edit artifact title/description/tags', 'update_artifact tool', 'Edit in web UI → artifact detail page'],
                ['Delete an artifact', 'delete_artifact tool', 'Web UI only (safer — no accidental chat deletion)'],
                ['List own private artifacts', 'list_artifacts scope limited to public', 'Web UI gallery shows private artifacts when signed in'],
                ['Upload a local file directly', 'MCP has no binary transport (protocol limit)', 'Host file publicly → publish_artifact(url=…)'],
                ['Delete / edit a comment', 'delete_feedback / update_feedback tools', 'No workaround today'],
              ]}
            />
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
              <strong>Note on binary uploads:</strong> The MCP protocol has no mechanism for transferring binary file data. Publishing from Claude-generated images requires first saving the image to a hosting URL (S3, Imgur, Cloudinary, GitHub), then calling <Code>publish_artifact(url=…)</Code>.
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
