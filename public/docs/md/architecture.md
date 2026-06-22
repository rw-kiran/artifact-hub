# Architecture & Technical Decisions

Engineering rationale for every stack choice in Artifact Hub.

---

## System overview

```
┌──────────────────────────────────────────────────────────┐
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
  Langfuse (LLM traces, async)
```

**Data flow — upload:**
```
Browser → POST /api/upload (MIME+size check) → Vercel Blob
        → POST /api/artifacts (DB record)
        → background: extractContent → generateMetadata → UPDATE artifacts
```

**Data flow — MCP:**
```
Claude Desktop → POST /api/mcp (Bearer auth → per-user key lookup)
               → AsyncLocalStorage sets userId
               → tool dispatch → Supabase (service role) / Vercel Blob / Claude
```

**Data flow — search:**
```
GET /api/search?q=... → embedTexts() → hybrid_search() RPC (BM25 + cosine)
                      → [if candidates > limit] Claude reranker → results
```

---

## Stack decisions

### Next.js 15 App Router

**Chosen over:** Remix, Astro, plain Express + React SPA

**Why:**
- Vercel-native: zero config for serverless deployment, preview URLs per PR, Edge middleware
- App Router Server Components cut the client JS bundle — the gallery and viewer pages ship almost no JS
- File-system routing maps cleanly to the required URL structure (`/artifacts/[id]`, `/share/[token]`, `/api/*`)
- `after()` (Next.js 15 API) allows firing async work (metadata generation, feedback summary) after the response is sent, without a background job queue

**Trade-off:** App Router is newer and has sharper edges than Pages Router. `'use client'` boundary management requires attention. Acceptable given Vercel's first-party support.

---

### Supabase (PostgreSQL + Auth + RLS)

**Chosen over:** Neon + Auth0, PlanetScale + Clerk, plain Postgres + NextAuth

**Why:**
- Bundles Auth, DB, and RLS in one service — no separate auth provider to integrate
- GitHub OAuth in 10 minutes via Supabase dashboard
- Row-Level Security lets the DB enforce access control without middleware duplication — private artifacts are invisible at the query layer, not just the API layer
- pgvector extension available free tier — no separate vector store needed for RAG
- Supabase Studio gives a SQL editor for running migrations without CLI setup
- `@supabase/ssr` handles cookie-based auth for Next.js Server Components correctly

**Trade-off:** Supabase free tier has connection limits and cold-start latency on the DB. For a 2-day challenge with low concurrency, it's fine. Production at scale would warrant connection pooling (PgBouncer/Supavisor, which Supabase supports).

---

### Vercel Blob

**Chosen over:** AWS S3, Cloudinary, Uploadthing, Supabase Storage

**Why:**
- Zero config when deploying to Vercel — `BLOB_READ_WRITE_TOKEN` is the only env var needed
- Files served from Vercel's CDN immediately, no CloudFront or separate CDN setup
- `@vercel/blob` `put()` returns a public URL synchronously after upload
- 50 MB limit per file matches the use case (PDFs and images rarely exceed this)

**Trade-off:** Free tier blobs are public CDN only. Private artifacts are protected at the gallery/API level (RLS + auth), but if a blob URL leaks, the file is accessible. Vercel Blob protected URLs (paid plan) or a proxy route would close this gap. Noted as a known limitation.

---

### pgvector + hybrid search (BM25 + cosine)

**Chosen over:** Pinecone, Weaviate, Qdrant, Elasticsearch

**Why:**
- pgvector is a Postgres extension — no separate vector database service, no network hop, no sync lag
- Hybrid search (`hybrid_search()` RPC combines BM25 full-text and cosine similarity) outperforms either alone: BM25 catches exact title matches that fall below the cosine threshold; semantic catches intent-based queries that don't match exact keywords
- Claude reranker as a third pass when candidates exceed the limit covers edge cases where the hybrid scores are close
- Everything in one Postgres database means no eventual consistency issues between the artifact record and its embeddings

**Trade-off:** Postgres isn't purpose-built for vector search. At millions of artifacts, a dedicated vector store with an HNSW index tuned at the service level would be faster. At the current scale, Postgres with HNSW index on `artifact_chunks.embedding` is fast enough.

---

### EdgeFastMCP / fastmcp

**Chosen over:** Raw `@modelcontextprotocol/sdk` HTTP transport

**Why:**
- `fastmcp` `EdgeFastMCP` wraps the MCP SDK with a simpler tool registration API — `server.tool(name, schema, handler)` — removing ~200 lines of boilerplate for input/output schema wiring
- Edge-compatible: no Node-only APIs, runs in Vercel Edge Functions
- `StreamableHTTPServerTransport` is stateless — each request is independent, compatible with serverless functions (no persistent WebSocket)

**Trade-off:** `fastmcp` drops some Zod constraints at the transport layer (e.g. `z.string().uuid()` isn't enforced by the MCP SDK itself). We compensate with `assertUuid()` in `lib/mcp/utils.ts`. A known footgun, documented.

---

### Langfuse

**Chosen over:** Custom logging, Helicone, LangSmith, OpenTelemetry direct

**Why:**
- Free tier, generous token/trace limits
- Traces every Claude call with input, output, latency, token count — visible in a dashboard without writing a single query
- `langfuse.trace()` / `generation.end()` API is 4 lines per call — minimal instrumentation overhead
- Conditional initialization (skips gracefully if keys are missing) means local dev without Langfuse doesn't break
- Captures all four Claude call types: metadata generation, feedback summary, content extraction, search reranking

**Trade-off:** Langfuse adds ~100ms of async flushing after each LLM call (`langfuse.flushAsync()`). It's async and non-blocking for the user response. Acceptable.

---

### Google AI API (text-embedding-004)

**Chosen over:** Anthropic embeddings, OpenAI embeddings, Cohere embeddings

**Why:** Anthropic doesn't have a public embeddings API (as of build date). `text-embedding-004` is fast, cheap, and available without a separate account. 768-dimensional output, upcast to 1536d for pgvector compatibility.

**Trade-off:** Mixing Claude for generation and Google for embeddings adds a second API key and provider dependency. If Anthropic ships embeddings, migrating `lib/ai/embed.ts` is a one-file change.

---

### Tailwind CSS v4

**Chosen over:** Tailwind v3, CSS Modules, styled-components, vanilla CSS

**Why:**
- Single `@import "tailwindcss"` in `globals.css` — no `tailwind.config.js` needed
- All utility classes available by default with no purge configuration
- v4 + PostCSS integration is Vercel-native
- No JS-in-CSS runtime (important for Server Components — they have no JS runtime)

**Trade-off:** v4 is newer and some third-party component libraries still depend on v3 class names. Since we write our own components, this isn't an issue.

---

### Supabase Auth (GitHub OAuth)

**Chosen over:** NextAuth, Clerk, Auth0, custom JWT

**Why:**
- Co-located with the DB — no cross-service session token passing
- `@supabase/ssr` handles cookie-based auth for Next.js App Router correctly out of the box
- GitHub OAuth in one dashboard click — no PKCE implementation, no callback URL logic beyond the standard SSR helper
- `auth.uid()` available inside RLS policies — private artifact filtering is a single `eq('created_by', auth.uid())` call

**Trade-off:** Supabase Auth is GitHub-only here (configured for internal team use). Adding email/password or other OAuth providers is additive, not structural.

---

## Key design decisions

### RLS over middleware for authorization

Middleware auth guards the upload page and API routes. But the actual data filter for "only return my private artifacts" is in Postgres RLS, not the API layer. This means:
- If a future bug skips the API auth check, the DB still enforces the policy
- The `search_artifacts` RPC inherits RLS automatically — no explicit filter needed in the function
- MCP server uses the service role (bypasses RLS) because it's authenticated at the API layer and needs to write on behalf of any user

### Service role in MCP

The MCP server calls Supabase with the service role key. This bypasses RLS entirely. The trade-off is deliberate: the MCP server's auth (per-user API keys, timing-safe comparison) is the trust boundary. Once a tool call passes auth, the server uses `AsyncLocalStorage` to thread `userId` into every write — `created_by`, `author_email`, etc. are set from the authenticated user, not from tool input.

The alternative (anon key + user JWT in MCP) would require passing a Supabase JWT through the MCP Bearer token layer, which has no standard mechanism.

### Per-user MCP API keys

A single `MCP_API_KEY` environment variable is available as a fallback for local dev. In production, every user generates their own key at `/settings/mcp`. Why:
- Revocation is per-user and immediate (flip `revoked_at`)
- `last_used_at` tracks which clients are active
- Artifacts published via MCP are attributed to the correct user (`created_by`)
- A leaked key only exposes that user's identity, not a global credential

### In-memory rate limiting

Middleware rate-limits AI routes (search, upload, feedback) at 20 req/min per IP, stored in a `Map`. This works per-function-instance — under Vercel's concurrency, multiple instances mean the cap isn't globally enforced. The comment in `middleware.ts` calls this out explicitly:

```
// ponytail: in-memory, per Edge-function instance. Works under normal load;
// upgrade to @upstash/ratelimit (+ Upstash Redis) when multi-instance bursting becomes a concern.
```

Upgrade path: swap the `checkRateLimit` function for `@upstash/ratelimit` with a sliding window algorithm and an Upstash Redis URL. One-hour change.

### `after()` for async feedback summary

When feedback is submitted, `summarizeFeedback()` runs via Next.js `after()` — it fires after the 201 response is sent to the client. This keeps the feedback submit latency at ~50ms (just the DB write), not 1500ms (DB write + Claude call).

The alternative — a background job queue (e.g. Inngest, Trigger.dev) — would add a dependency and infrastructure complexity. `after()` is the right scope for a task that takes < 5 seconds and doesn't need retry guarantees.

---

## Known limitations & upgrade paths

| Limitation | Impact | Upgrade path |
|---|---|---|
| In-memory rate limiting | Ineffective across multiple Vercel instances | `@upstash/ratelimit` + Upstash Redis |
| Vercel Blob public CDN | Private artifact URLs guessable if leaked | Vercel Blob protected URLs (paid) or proxy reads |
| No artifact versioning | Re-upload creates a new artifact | Add `parent_artifact_id` FK + version chain |
| No binary MCP uploads | Local files can't be published directly via MCP | Protocol limitation; no workaround until MCP adds binary transport |
| `text-embedding-004` not Anthropic | Two API providers | Migrate `lib/ai/embed.ts` if Anthropic ships embeddings |
| No email notifications | Owner unaware of new feedback | Add Resend/Postmark integration + `created_by` email lookup |
| Single-tenant auth | No org/team model | Add `organizations` table, team membership, org-scoped RLS |

---

*Artifact Hub · Architecture reference · Last updated 2026-06-21*
