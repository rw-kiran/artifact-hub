# CLAUDE.md — Artifact Hub Engineering Guide

## What this is
Artifact Hub: a platform for publishing, browsing, reviewing, and sharing AI-generated content (HTML, images, PDFs). Built as a 2-day challenge, deployed on Vercel.

See `PHASES.md` for the full delivery plan. See `WRITEUP.md` for the final product summary.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | Vercel-native, Server Components reduce JS bundle |
| Database | Supabase (PostgreSQL) | Free tier, pgvector ready, Auth + RLS built-in |
| Storage | Vercel Blob | Zero-config file storage, signed URLs, public CDN |
| Auth | Supabase Auth (GitHub OAuth) | One-click for dev teams, no custom auth code |
| AI | `claude-sonnet-4-6` via `@anthropic-ai/sdk` | Requirement + best multimodal for artifact analysis |
| MCP | `@modelcontextprotocol/sdk` HTTP transport | Serverless-compatible, no persistent connections |
| LLM tracing | Langfuse (free tier) | Traces every Claude call; cost + latency visibility |
| App monitoring | Vercel Analytics + Speed Insights | Zero-config, already in layout.tsx |
| Testing | Vitest (unit) + Playwright (e2e) | Vitest is fast for pure TS; Playwright for flows |
| Styling | Tailwind CSS v4 | Single `@import "tailwindcss"` in globals.css |

---

## Engineering Principles

### YAGNI — You Ain't Gonna Need It
Don't build for phase N+2 during phase N. No abstract base classes, no plugin systems, no feature flags for things that have one implementation. Delete stubs before committing.

### DRY — Don't Repeat Yourself
- All types in `lib/types.ts`
- Supabase client singleton in `lib/db/supabase.ts` (server) and `lib/db/supabase-browser.ts` (client)
- All Claude calls in `lib/ai/claude.ts` — never instantiate `Anthropic` inline
- All MCP tools defined in `lib/mcp/server.ts`, wired into the route

### KISS — Keep It Simple
- Server Components by default; add `'use client'` only when you need interactivity
- DB constraints over app-level validation for invariants (CHECK, NOT NULL, FK)
- Supabase RLS over middleware for authorization
- PostgreSQL full-text search over a separate vector store

### 12-Factor
1. **Codebase** — one repo, one app  
2. **Dependencies** — all in `package.json`, no global installs  
3. **Config** — all secrets in env vars (see `.env.example`), never hardcoded  
4. **Backing services** — Supabase and Vercel Blob are swappable via env  
5. **Build/release/run** — `next build` → Vercel preview → Vercel prod  
6. **Processes** — stateless serverless functions, no in-memory state between requests  
7. **Port binding** — Vercel manages  
8. **Concurrency** — scale via function concurrency, no threads or workers  
9. **Disposability** — each function invocation is independent  
10. **Dev/prod parity** — use Supabase preview branches + Vercel preview deployments  
11. **Logs** — structured JSON to stdout only; Langfuse for LLM traces  
12. **Admin processes** — via Supabase Studio or direct SQL migration  

---

## Project Structure

```
app/
  api/
    artifacts/route.ts        # GET list, POST create
    artifacts/[id]/route.ts   # GET, PATCH, DELETE
    upload/route.ts           # Vercel Blob upload handler
    feedback/route.ts         # POST comment
    share/route.ts            # POST → generate share token
    search/route.ts           # GET ?q= → NL search via Claude
    mcp/route.ts              # MCP server (HTTP streaming transport)
  artifacts/
    [id]/page.tsx             # Artifact detail + feedback panel
    upload/page.tsx           # Upload form
  share/
    [token]/page.tsx          # Public share view (no auth required)
  layout.tsx                  # Root layout with Analytics/SpeedInsights
  page.tsx                    # Gallery / catalog
  globals.css                 # @import "tailwindcss"

components/                   # Named exports only, no default exports
  ArtifactCard.tsx
  ArtifactViewer.tsx          # iframe (HTML), img, embed (PDF)
  FeedbackPanel.tsx
  SearchBar.tsx
  UploadForm.tsx
  Nav.tsx

lib/
  types.ts                    # All shared TypeScript types
  db/
    supabase.ts               # Server-side Supabase client (service role)
    supabase-browser.ts       # Client-side Supabase client (anon key)
  ai/
    claude.ts                 # Anthropic client + all LLM helpers
    search.ts                 # NL search query builder
  mcp/
    server.ts                 # MCP Server instance + tool definitions

supabase/
  migrations/
    001_initial.sql           # Schema (run once via Studio or CLI)

tests/
  unit/                       # Vitest: lib/ functions, no DB
  integration/                # Playwright: full flows against preview URL

claude-sessions/              # Session logs for submission (see PHASES.md §6)
```

---

## Coding Standards

- **Named exports** — no `export default function`. Exception: Next.js page files require default export.
- **`async/await`** over `.then()` chains
- **Zod validation** at API trust boundaries (incoming POST bodies, MCP tool inputs)
- **Error shape** — `{ error: string, code: string }` for all API errors
- **No sensitive logging** — never log tokens, file contents, or emails in production
- **No `any`** — use `unknown` and narrow, or define a proper type

---

## AI / LLM Patterns

### Three invisible AI features (feel like product, not demo)

1. **Auto-metadata on upload** — Claude reads the uploaded content and generates `title`, `description`, and `tags`. Fires after upload, stored to DB. User can edit.

2. **Feedback summary** — Claude summarizes all comments for an artifact into 2-3 sentences. Stored as `artifacts.feedback_summary`, refreshed when new feedback is added. Shows on artifact detail above the comment list.

3. **Natural language search** — Claude parses the search query into structured SQL filters (type, tags, date range, keywords). Never raw string-to-SQL. Falls back to PostgreSQL FTS if Claude parsing fails.

### LLM call pattern (all calls go through `lib/ai/claude.ts`)

```typescript
// lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { Langfuse } from 'langfuse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const langfuse = new Langfuse()

export async function generateMetadata(content: string, type: string) {
  const trace = langfuse.trace({ name: 'generate-metadata' })
  const generation = trace.generation({ name: 'claude-call', model: 'claude-sonnet-4-6' })
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: `...prompt...` }],
  })
  
  generation.end({ output: response.content[0] })
  await langfuse.flushAsync()
  return response
}
```

### MCP server tools

The MCP server lives at `/api/mcp` using `StreamableHTTPServerTransport`. Tools:

| Tool | Purpose |
|---|---|
| `publish_artifact` | Upload URL + auto-generate metadata |
| `list_artifacts` | Gallery with optional filters |
| `get_artifact` | Artifact + feedback summary |
| `search_artifacts` | NL search → structured query |
| `share_artifact` | Create time-limited share link |
| `add_feedback` | Leave structured comment + rating |
| `summarize_feedback` | Get or regenerate the AI summary |

MCP auth: `Authorization: Bearer $MCP_API_KEY` header on all requests.

---

## Security Checklist

- [ ] Supabase RLS on all tables — never trust client-side checks
- [ ] MCP server validates `MCP_API_KEY` on every request
- [ ] File uploads: validate MIME type server-side (not extension), max 50MB
- [ ] Share tokens: `crypto.randomBytes(32)`, never sequential
- [ ] All SQL via Supabase client (parameterized) — no string concatenation
- [ ] Claude output used for display only, never executed or passed to SQL

---

## Testing Philosophy

- **Unit tests** (`tests/unit/`): test `lib/` functions with no DB. Mock `anthropic` and `supabase` at module boundary.
- **Integration tests** (`tests/integration/`): Playwright against a real preview URL with real credentials. Three critical flows:
  1. Upload → gallery appears → view artifact
  2. Generate share link → open in incognito → view
  3. Leave feedback → AI summary updates
- No coverage targets — tests exist to catch regressions in the critical path.

---

## Environment Setup

```bash
# 1. Install deps
npm install

# 2. Copy env vars
cp .env.example .env.local
# Fill in: SUPABASE URL/ANON/SERVICE keys, BLOB token, ANTHROPIC key, LANGFUSE keys

# 3. Apply DB migrations
# Option A: Paste supabase/migrations/001_initial.sql into Supabase Studio SQL editor
# Option B: supabase login && supabase link --project-ref <ref> && supabase db push

# 4. Run
npm run dev
# → http://localhost:3000
```

---

## Phase Order

Do not start Phase N until Phase N-1 is merged as a PR.

| Phase | Focus | Estimated Time |
|---|---|---|
| 0 | Foundation (this setup) | ✅ done |
| 1 | Publish + Browse | 4h |
| 2 | Share | 1.5h |
| 3 | Feedback | 2h |
| 4 | MCP Server | 3h |
| 5 | AI Features + Observability | 1.5h |
| 6 | QA + Deploy + WRITEUP | 2.5h |

See `PHASES.md` for detailed stories, acceptance criteria, and dependency graph.
