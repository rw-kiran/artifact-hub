# Artifact Hub — Writeup

---

## What I built and why

Artifact Hub solves a real lifecycle problem: AI-generated content (HTML mockups, PDFs, images) gets created and then lost. It ends up in blob storage, shared via expiring Slack URLs, with feedback scattered across threads. There's no browse, no search, no structured review, no memory.

The platform I built has five surfaces:

**Gallery** — a browsable, searchable catalog of published artifacts with type filters and tag filters. Public artifacts are visible to anyone; private ones only to their owner.

**Upload** — drag a file or submit a URL. Claude reads the content and generates title, description, and tags automatically. The user can edit them, but they rarely need to.

**Viewer** — artifact detail page renders HTML in a sandboxed iframe (with `allow-scripts` but `allow-same-origin` denied), images natively, PDFs via `<embed>`. Feedback thread and AI summary sit below.

**Share** — generate a time-limited signed URL (1–168 hours). The `/share/[token]` route requires no auth and shows a stripped-down view. Expired tokens return 404.

**MCP server** — seven tools that let Claude Desktop, Cursor, or any MCP client publish, browse, search, share, and review artifacts through natural conversation.

### Product decisions

- I built sharing as time-limited links (not role-based ACL) because the main use case is "send this to a client or reviewer once." Full ACL is complexity that pays off only when you have teams with members who recur.
- Feedback is public (any authenticated user can comment, no invite-only review). For the use case — internal teams reviewing AI output — this is the right default. Access control on feedback adds friction with no benefit here.
- The gallery shows public artifacts by default with no authentication required. Discoverability matters more than privacy for this use case.
- The MCP server issues per-user API keys (not a single shared token). This means every MCP caller has their own identity, revocation is scoped, and the server knows who published what.

---

## What I chose not to build and why

**Role-based access control / teams** — The sharing model (public/private + time-limited links) covers the real cases. Full team/org/role ACL would have taken 2–3 days alone and pushed core features out.

**Edit artifact content after upload** — You can update metadata (title, description, tags) via API but not re-upload the file. Re-uploads mean versioning logic. Out of scope.

**Delete artifact / delete comment via MCP** — Destructive mutations over chat feel risky. A user asking Claude to "delete the report artifact" and getting it wrong is bad UX. Deletion is web-UI only where the intent is unambiguous.

**Notifications** — No email/webhook when someone comments on your artifact. Useful, but not load-bearing for the core review workflow. Would need another dependency (Resend, SendGrid).

**Public artifact embedding** — No `<iframe>` embed code for third-party sites. The share link covers the use case for now.

**Video/audio artifacts** — HTML, images, and PDFs cover the AI-generated content types mentioned in the brief. Video is a different storage/streaming problem.

---

## Architecture overview

```
Browser / MCP client
       │
       ▼
  Vercel (Edge + Serverless)
  ├── Next.js 15 App Router
  │   ├── Server Components (gallery, viewer, docs)
  │   ├── Client Components (upload form, feedback panel, share modal, nav)
  │   └── API Routes (artifacts, upload, feedback, share, search, mcp, auth, health)
  │
  ├── Middleware (rate limiting + auth guard)
  │
  ├── lib/
  │   ├── ai/        (Claude calls, embeddings, content extraction, ingest, search)
  │   ├── db/        (Supabase server + browser clients)
  │   ├── mcp/       (EdgeFastMCP server, context, utils)
  │   └── validation.ts / ssrf.ts / crypto.ts
  │
  └── External services:
      ├── Supabase  (PostgreSQL + Auth + RLS + pgvector)
      ├── Vercel Blob  (file storage, public CDN)
      ├── Anthropic API  (Claude Sonnet 4.6)
      ├── Google AI API  (text-embedding-004 for RAG)
      └── Langfuse  (LLM trace observability)
```

**Request flows:**

- Upload: browser → `POST /api/upload` (MIME + size validation → Vercel Blob) → `POST /api/artifacts` (create DB record) → background: `extractContent` → `generateMetadata` → update record
- MCP: Claude Desktop → `POST /api/mcp` (Bearer auth → per-user key lookup) → tool dispatch → Supabase (service role) / Vercel Blob / Claude
- Search: `GET /api/search?q=…` → `hybridSearch()` → pgvector cosine + BM25 via `hybrid_search()` RPC → Claude reranker if candidates > limit → results

**DB schema (core tables):**
- `artifacts` — id, title, description, tags[], type, blob_url, created_by, visibility, search_vector (tsvector), feedback_summary, index_status
- `feedback` — id, artifact_id, author_email, content, rating (1–5)
- `share_tokens` — id, artifact_id, token (hex-32), expires_at
- `mcp_api_keys` — id, user_id, name, key_prefix, key_hash (SHA-256), revoked_at
- `artifact_chunks` — id, artifact_id, chunk_index, content, embedding (vector 1536d)

All tables have RLS. The MCP server uses the service role key (bypasses RLS) and enforces identity via the authenticated `userId` passed through `AsyncLocalStorage`.

---

## How the MCP integration works

The MCP server lives at `POST /api/mcp` using `StreamableHTTPServerTransport` (stateless, serverless-compatible — no WebSocket or SSE required).

**Auth:** Every request must carry `Authorization: Bearer <key>`. The server first tries a SHA-256 hash lookup against `mcp_api_keys` (per-user keys generated at `/settings/mcp`). If no match, it falls back to the `MCP_API_KEY` env var for local dev. Auth uses `timingSafeEqual` to prevent timing attacks.

**User context:** Authenticated `userId` is stored in `AsyncLocalStorage` per request. Tools that write (publish, add_feedback, share) use this to set `created_by` / `author_*` fields, so artifacts created via MCP are owned by the right user.

**Tools:**

| Tool | What it does | Notable design |
|---|---|---|
| `publish_artifact` | Fetch URL → validate MIME → store to Vercel Blob → create artifact → async metadata generation | SSRF-safe fetch, rejects private IPs |
| `list_artifacts` | Public gallery with type/tag/limit filters | Strips PostgREST metacharacters to prevent filter injection |
| `get_artifact` | Fetch by id, title, or tags; returns full artifact + feedback | Returns `candidates` list when title is ambiguous |
| `search_artifacts` | Hybrid BM25 + semantic search | Falls back to FTS if embeddings fail |
| `share_artifact` | Create time-limited share token, return URL | Returns candidate list when query matches multiple |
| `add_feedback` | POST comment + 1–5 star rating | Fires `summarizeFeedback` in background via `after()` |
| `summarize_feedback` | Return cached AI summary or trigger regeneration | Returns "not enough feedback" if < 2 comments |

**Why 7 tools, not more:** I didn't add `delete_artifact`, `update_artifact`, or `delete_feedback`. Destructive and edit operations over chat have poor UX — the user doesn't see a confirmation dialog, and ambiguous inputs can cause real data loss. The web UI handles these cases safely.

**Claude Desktop / Cursor config:**

```json
{
  "mcpServers": {
    "artifact-hub": {
      "type": "http",
      "url": "https://artifact-hub.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

Generate your API key at `/settings/mcp` after signing in.

---

## Where and why I used LLM capabilities

Three AI features, all invisible by design — they make the product better without surfacing "AI" as the point.

### 1. Auto-metadata on upload

**What fires:** After a file is stored, `extractContent()` reads the artifact content (HTML: strip tags; PDF: base64 + Claude doc block; image: Claude vision). Then `generateMetadata()` returns structured `{ title, description, tags }` as JSON.

**Why:** Manually titling and tagging every upload is the biggest friction point in a content hub. By the time the user sees the detail page, the metadata is already there. They edit it 10% of the time.

**Model:** `claude-sonnet-4-6` with a structured output prompt. Max 512 tokens — fast enough that it usually completes before the user navigates to the artifact.

### 2. Feedback summary

**What fires:** When `add_feedback` is called (web or MCP), the route calls `summarizeFeedback()` asynchronously via `after()`. Claude reads all comments for the artifact and writes 2–3 sentences summarizing the consensus. Stored as `artifacts.feedback_summary`.

**Why:** When an artifact has 8 comments, no one reads them all. The summary sits above the thread and answers "is this approved?" without requiring the reader to parse every comment.

**Model:** `claude-sonnet-4-6`. Short output (128 tokens max). Returns early with "Not enough feedback yet" if fewer than 2 comments.

### 3. Natural language search (hybrid)

**What fires:** `GET /api/search?q=the dashboard with the blue charts`. The query goes through `hybridSearch()`:
1. `embedTexts()` converts the query to a 1536d vector via Google `text-embedding-004`
2. `hybrid_search()` Postgres RPC runs BM25 full-text + cosine similarity in parallel, returning a ranked union
3. If candidates exceed the limit, `claude-sonnet-4-6` reranks them by semantic relevance to the original query

**Why:** Tag/keyword search alone misses intent. "Find the revenue report from last quarter" shouldn't require knowing the exact tags. Hybrid search is substantially better than either BM25 or vector-only — the BM25 side catches exact title matches that often fall below the semantic distance threshold.

**Why Google embeddings for RAG:** Anthropic doesn't have a public embeddings API. `text-embedding-004` (768d, upcast to 1536d for pgvector compatibility) is fast, cheap, and available without a separate account.

---

## Deployment approach

**Hosting:** Vercel (serverless functions + Edge middleware). Zero-config for Next.js, auto-deploys on push to `main`, preview deployments per PR.

**Database:** Supabase free tier — PostgreSQL with pgvector extension, Auth (GitHub OAuth), RLS, and the Studio UI for migrations.

**Storage:** Vercel Blob — public CDN, signed upload, no separate bucket management.

**Observability:** Langfuse (free tier) receives a trace for every Claude call. Vercel Analytics tracks page views; Speed Insights tracks Core Web Vitals.

**Environment variables required:**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key (bypasses RLS) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `ANTHROPIC_API_KEY` | Claude API key |
| `LANGFUSE_SECRET_KEY` | Langfuse auth |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_HOST` | Langfuse endpoint (default: cloud.langfuse.com) |
| `NEXT_PUBLIC_APP_URL` | Public URL (for share link generation) |
| `GOOGLE_API_KEY` | Google AI (text-embedding-004 for RAG) |

**Branch strategy:** `feat/phase-N` branches, each merging to `main` via PR after lint + type-check + test gates pass. No direct commits to `main`.

---

## What I'd do next with another week

**Priority 1 — Private blob protection.** Vercel Blob free tier serves all files on a public CDN. Private artifacts are hidden from the gallery (via RLS), but their blob URL is guessable if it leaks. Upgrading to Vercel Blob protected URLs (or proxying reads through `/api/artifacts/[id]/content` with auth) would close this gap.

**Priority 2 — Multi-instance rate limiting.** The current rate limiter is in-memory, so it resets per serverless function instance. Under real load across multiple Vercel instances, the 20 req/min cap is ineffective. Swap to `@upstash/ratelimit` + Upstash Redis (~1 hour of work).

**Priority 3 — `update_artifact` MCP tool.** The most-requested gap from the use case matrix — users want to fix titles and tags through conversation, not just at upload time.

**Priority 4 — Artifact versioning.** Right now, re-uploading means a new artifact. For a real team workflow, versioning (v1, v2, v3 of the same artifact) with diff and history would be high value.

**Priority 5 — Email notifications.** Alert artifact owners when new feedback arrives. One Resend/Postmark integration, one email template.

**Priority 6 — Private artifact access sharing.** Today, private artifacts are only visible to their owner. A "share with specific users" model (by email) would unlock team review workflows without opening everything to public.

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- A Vercel account (for Blob storage token)
- An Anthropic API key
- A Google AI API key (for embeddings)
- Optional: Langfuse account (observability)

### Running locally

```bash
# 1. Clone and install
git clone https://github.com/rw-kiran/artifact-hub
cd artifact-hub
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all variables (see Environment variables table above)

# 3. Apply DB migrations
# Option A: paste supabase/migrations/*.sql into Supabase Studio → SQL Editor (in order)
# Option B: supabase login && supabase link --project-ref <ref> && supabase db push

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Run tests
npm run test          # unit (Vitest)
npm run test:e2e      # integration (Playwright) — requires PLAYWRIGHT_BASE_URL
```

### Setting up the MCP server

1. Sign in to Artifact Hub and navigate to **Settings → MCP** (`/settings/mcp`)
2. Click **Generate API Key** — give it a name (e.g. "Claude Desktop")
3. Copy the key (shown once)
4. Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "artifact-hub": {
      "type": "http",
      "url": "https://artifact-hub.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-key>"
      }
    }
  }
}
```

5. Restart Claude Desktop — you'll see "artifact-hub" in the tools list

### Quick demo flows

**Flow 1: Upload and browse**
1. Sign in with GitHub
2. Go to `/artifacts/upload`
3. Drop any HTML file or image → click Upload
4. Claude generates title, description, and tags automatically
5. Navigate to `/` — your artifact appears in the gallery

**Flow 2: Share an artifact**
1. Open any artifact detail page
2. Click **Share** → choose expiry (e.g. 24 hours)
3. Copy the link — it works without signing in, in any browser

**Flow 3: Leave feedback**
1. Open an artifact detail page
2. Scroll to the feedback panel — add a comment and a star rating
3. After submitting, the AI summary updates above the thread

**Flow 4: MCP conversation (Claude Desktop)**
```
You: "Publish this dashboard from https://example.com/dashboard.html"
Claude: [calls publish_artifact] → "Published 'Q4 Revenue Dashboard' with tags: finance, dashboard, q4"

You: "Share it with the team for 48 hours"
Claude: [calls share_artifact] → "Here's the link: https://artifact-hub.vercel.app/share/abc123 (expires in 48h)"

You: "What's the feedback on the latest artifact?"
Claude: [calls list_artifacts, summarize_feedback] → "Two reviewers commented: they like the layout but want more granular data for EMEA."
```

---

## Written walkthrough (key flows)

### 1. Upload → auto-metadata → gallery

1. Navigate to `http://localhost:3000` (or production URL)
2. Sign in with GitHub
3. Click **Upload** in the nav bar → `/artifacts/upload`
4. Drag a `.html`, `.png`, `.jpg`, `.gif`, `.webp`, or `.pdf` file into the drop zone
5. Click **Upload artifact**
6. The browser POST goes to `/api/upload` (MIME validated, 50 MB max, stored to Vercel Blob)
7. Then `POST /api/artifacts` creates the DB record and fires background metadata extraction
8. You're redirected to the artifact detail page — within ~2 seconds the title, description, and tags populate from Claude's analysis
9. Navigate to `/` — the gallery card shows your artifact with its AI-generated metadata

### 2. Share link generation

1. Open any artifact detail page (e.g. `/artifacts/abc-123`)
2. Click the **Share** button (top right of the viewer)
3. In the modal, set expiry (default: 24 hours; max: 168 hours)
4. Click **Generate link**
5. Copy the URL (e.g. `https://artifact-hub.vercel.app/share/7f3a9...`)
6. Open the link in an incognito window — no sign-in required
7. After the expiry time, the link returns 404

### 3. Leave feedback → AI summary updates

1. Open an artifact detail page
2. Scroll below the viewer to the **Feedback** panel
3. Type a comment and optionally select a star rating (1–5)
4. Click **Submit**
5. The comment appears in the thread immediately
6. Within ~3 seconds, the **AI Summary** box above the thread updates to reflect the new comment
7. The summary is regenerated by Claude Sonnet 4.6 and stored as `feedback_summary` on the artifact

### 4. MCP conversation flow

1. Add the MCP server config to Claude Desktop (see Getting Started → MCP setup)
2. Restart Claude Desktop
3. In a new conversation, ask: _"Show me all artifacts tagged 'design'"_
   - Claude calls `list_artifacts(tag="design")` and lists the results
4. Ask: _"Get me the details on the landing page one"_
   - Claude calls `get_artifact(title="landing page")` — if ambiguous, it shows a candidate list and asks you to confirm
5. Ask: _"Leave a 5-star review saying 'Clean and minimal'"_
   - Claude calls `add_feedback(artifact_id=…, content="Clean and minimal", rating=5)`
6. Ask: _"Share it for 72 hours and give me the link"_
   - Claude calls `share_artifact(artifact_id=…, expires_in_hours=72)` and returns the URL
