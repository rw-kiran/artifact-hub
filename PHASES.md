# PHASES.md — Artifact Hub Delivery Plan

> 2-day time-box. Each phase ships as a PR. Merge before starting next.

---

## Phase Map

```
P0 Foundation
└─► P1 Publish + Browse
    └─► P2 Share
        └─► P3 Feedback  ──┐
            └─► P4 MCP      │ both inform
                └─► P5 AI ◄─┘
                    └─► P6 QA + Deploy + WRITEUP
```

---

# Hat 1 — Technical Product Manager

## Product Philosophy

This is a team tool, not a consumer app. The target user is a developer or designer who generates AI content and needs a way to share it for async feedback — without using Slack threads, Drive folders, or expiring blob URLs.

**What we're building:** The simplest thing that makes the lifecycle feel managed. Upload → browse → share → collect structured feedback. MCP means an LLM can do this conversationally.

**What we're not building:**
- Version control for artifacts (YAGNI — out of scope)
- Real-time collaboration (websockets add complexity; async is fine for feedback)
- Role-based permissions beyond owner/viewer (one level of sharing is enough)
- Mobile-first UI (this is an internal tool; desktop is fine)
- Custom domains for shares (Vercel share URLs are acceptable)

## Phase Breakdown

### Phase 0: Foundation (✅ Done — this session)
**Goal:** Repo runs locally with `npm install && npm run dev`.  
**Done:** package.json, tsconfig, Next.js config, Tailwind, DB schema, CLAUDE.md, PHASES.md

### Phase 1: Publish + Browse
**Goal:** A user can upload an HTML/image/PDF artifact, give it a title, and see it in a gallery.  
**Success metric:** Upload → gallery page shows card → click card → preview renders correctly for all 3 types.

### Phase 2: Share
**Goal:** Artifact owner can generate a time-limited URL. Anyone with the URL can view without logging in.  
**Success metric:** Generate a 24h link → open in incognito → artifact is visible → link expires after set time.

### Phase 3: Feedback
**Goal:** Viewers can leave a structured comment (text + optional 1–5 rating) on an artifact.  
**Success metric:** Leave 3 comments → all appear in chronological order on artifact detail page.

### Phase 4: MCP Server
**Goal:** Reviewer can add the MCP server to Claude Desktop and publish/search/share artifacts conversationally.  
**Success metric:** Claude Desktop can publish an artifact, search by natural language, and get a share link in one conversation.

### Phase 5: AI Features + Observability
**Goal:** The 3 invisible AI features (auto-metadata, NL search, feedback summary) are live and traced in Langfuse.  
**Success metric:** Upload a PDF → title/tags auto-populated. Search "financial dashboards" → relevant results. Artifact with 5 comments shows a 2-sentence summary.

### Phase 6: QA + Deploy + WRITEUP
**Goal:** System is live at a public URL, integration tests pass, WRITEUP.md is complete.  
**Success metric:** Reviewer can visit the URL, use the product, add the MCP server to Claude Desktop — all without local setup.

---

# Hat 2 — Principal Engineering Architect

## Dependency Graph

```
DB Schema (001_initial.sql)
  │
  ├─► lib/types.ts
  │     │
  │     ├─► lib/db/supabase.ts ──────────────► API routes
  │     ├─► lib/ai/claude.ts ───────────────► AI features (Phase 5)
  │     └─► lib/mcp/server.ts ──────────────► /api/mcp (Phase 4)
  │
  ├─► app/api/upload/route.ts ─────────────► Vercel Blob
  ├─► app/api/artifacts/route.ts
  ├─► app/api/artifacts/[id]/route.ts
  ├─► app/api/feedback/route.ts ──────────► (depends on artifacts)
  ├─► app/api/share/route.ts
  ├─► app/api/search/route.ts ────────────► (depends on claude.ts)
  └─► app/api/mcp/route.ts ───────────────► (depends on all of the above)
```

## Engineering Stories

### Phase 1 Stories

**S1.1 — File Upload to Vercel Blob**
- `POST /api/upload` accepts `multipart/form-data`
- Validate MIME type: `text/html`, `image/*`, `application/pdf`
- Max 50MB, return `{ url, pathname, contentType }`
- Unit test: MIME validation rejects `.exe`, accepts valid types

**S1.2 — Artifact Create**
- `POST /api/artifacts` with `{ blob_url, blob_pathname, type, title?, description?, tags?, visibility? }`
- Validates with Zod, inserts to Supabase, returns artifact
- Requires authenticated user (Supabase session cookie)
- Unit test: Zod schema rejects missing `blob_url`

**S1.3 — Gallery Page**
- `GET /api/artifacts` returns paginated list (20/page), filter by type/tag
- `app/page.tsx` fetches server-side, renders `<ArtifactCard>` grid
- `<ArtifactCard>` shows: thumbnail/type badge, title, tags, creator, date
- No client JS required (Server Component)

**S1.4 — Artifact Viewer**
- `app/artifacts/[id]/page.tsx` fetches artifact + renders preview
- `<ArtifactViewer>`: `<iframe>` for HTML, `<img>` for images, `<embed>` for PDFs
- HTML iframe must be sandboxed: `sandbox="allow-scripts allow-same-origin"`

**S1.5 — Auth**
- Supabase Auth with GitHub OAuth
- `/api/auth/callback/route.ts` (Supabase SSR callback handler)
- Nav shows Sign In / Sign Out, user avatar when signed in
- Upload page redirects to sign-in if unauthenticated

**Acceptance criteria Phase 1:**
- [ ] Upload HTML, image, PDF — each previews correctly
- [ ] Gallery shows all public artifacts
- [ ] Sign in with GitHub works
- [ ] `npm run test` passes

### Phase 2 Stories

**S2.1 — Share Token Generation**
- `POST /api/share` with `{ artifact_id, expires_in_hours }` (default 24h, max 168h/7d)
- Inserts `share_tokens` row, returns `{ url: "${APP_URL}/share/${token}" }`
- Owner-only (check `created_by = auth.uid()`)

**S2.2 — Share View**
- `app/share/[token]/page.tsx` — looks up token via service role (bypasses RLS)
- Check `expires_at > now()` — show expired page if stale
- Renders same `<ArtifactViewer>` but no feedback panel, no auth required
- Shows "X hours remaining" badge

**S2.3 — Share UI**
- Share button on artifact detail → modal with expiry picker + generated URL
- Copy-to-clipboard button
- List of active share links for owners

**Acceptance criteria Phase 2:**
- [ ] Share link works in incognito
- [ ] Expired link shows "this link has expired" page
- [ ] Owner can see all active links for their artifact

### Phase 3 Stories

**S3.1 — Feedback API**
- `POST /api/feedback` with `{ artifact_id, content, rating? }`
- Zod validates: content 10–1000 chars, rating 1–5 if present
- Authenticated user only; `author_email` from session
- On insert: triggers Phase 5 feedback_summary refresh (async, non-blocking)

**S3.2 — Feedback UI**
- `<FeedbackPanel>` on artifact detail page
- Shows comments chronologically with author, date, optional star rating
- Add-comment form (Client Component) with optimistic update
- Owners see all feedback; visitors see feedback on public artifacts

**Acceptance criteria Phase 3:**
- [ ] Leave a comment with and without rating
- [ ] Comments appear without full page reload
- [ ] Rating renders as stars (1-5)

### Phase 4 Stories

**S4.1 — MCP Server Route**
- `app/api/mcp/route.ts` using `StreamableHTTPServerTransport`
- Auth: validate `Authorization: Bearer $MCP_API_KEY` before processing
- POST and GET handlers for MCP protocol handshake

**S4.2 — MCP Tools**
```
publish_artifact(url, type, title?, description?, tags?, visibility?)
  → uploads from URL, creates artifact, returns artifact with generated metadata

list_artifacts(type?, tag?, limit?)
  → returns array of artifact summaries

get_artifact(id)
  → returns full artifact with feedback and summary

search_artifacts(query, type?, limit?)
  → NL search (Claude parses query → FTS), returns ranked results

share_artifact(artifact_id, expires_in_hours?)
  → creates share token, returns shareable URL

add_feedback(artifact_id, content, rating?, author_name?, author_email?)
  → creates feedback record, returns confirmation

summarize_feedback(artifact_id)
  → returns or generates the AI feedback summary
```

**S4.3 — MCP Tool quality bar**
- Tool descriptions must be conversational ("Publish a new artifact to the hub")
- Return shapes should be human-readable first, IDs second
- Error messages should suggest the next action ("Artifact not found. Use list_artifacts to see available IDs.")

**Acceptance criteria Phase 4:**
- [ ] Claude Desktop can discover and list all tools
- [ ] Full publish → share → feedback flow via conversation
- [ ] Unauthorized requests return 401

### Phase 5 Stories

**S5.1 — Auto-metadata generation**
- Fires after artifact insert (called from `POST /api/artifacts` after Supabase insert)
- For HTML: extract `<title>` and visible text (first 2000 chars), send to Claude
- For images: send as base64 to Claude vision, ask for title/description/tags
- For PDFs: extract first 2000 chars of text, send to Claude
- Claude prompt returns JSON: `{ title, description, tags: string[] }`
- Patch artifact with generated values (user can override via edit)

**S5.2 — Feedback summary**
- Called after every new feedback insert (async, non-blocking via `waitUntil` or fire-and-forget)
- If fewer than 2 feedback items, skip (not enough to summarize)
- Claude prompt: "Summarize this feedback in 2-3 sentences, noting key themes and overall sentiment."
- Store result in `artifacts.feedback_summary`
- Display above comment list as a light-gray summary card

**S5.3 — NL Search**
- `GET /api/search?q=...` sends query to Claude with schema:
  `{ keywords: string[], tags?: string[], type?: ArtifactType, date_from?: string }`
- Build Supabase query from structured output
- Fall back to raw FTS if Claude fails or times out
- Unit test: structured output parsing

**S5.4 — Langfuse tracing**
- Every Claude call gets a trace with: `name`, `model`, `artifact_id`, `input_tokens`, `output_tokens`
- Wrap all calls in `lib/ai/claude.ts` — no `new Anthropic()` outside this file
- Verify in Langfuse dashboard that all 3 features appear as separate trace names

**Acceptance criteria Phase 5:**
- [ ] Upload a PDF → title/tags appear within 5 seconds
- [ ] Search "quarterly report" returns relevant artifacts
- [ ] Artifact with 3+ comments shows a summary
- [ ] All 3 LLM trace names visible in Langfuse

---

# Hat 3 — Sr. Staff Engineer

## Local Setup (run once)

```bash
# Prerequisites: Node 22+, npm 10+

# 1. Clone and install
git clone <repo-url>
cd artifact-hub
npm install

# 2. Supabase project
# → supabase.com → New Project → copy URL, anon key, service role key
# → SQL Editor → paste contents of supabase/migrations/001_initial.sql → Run
# → Authentication → Providers → GitHub → enable → add OAuth app credentials

# 3. Vercel Blob
# → vercel.com → Storage → Create Blob Store → copy BLOB_READ_WRITE_TOKEN

# 4. Anthropic API key
# → console.anthropic.com → API Keys → create

# 5. Langfuse
# → langfuse.com → New Project → copy secret + public keys

# 6. Environment
cp .env.example .env.local
# Fill in all values from above steps

# 7. Generate MCP key
openssl rand -hex 32  # → MCP_API_KEY in .env.local

# 8. Run
npm run dev
# → http://localhost:3000
```

## Per-Phase Delivery Checklist

Before starting each phase:
- [ ] Previous phase PR is merged
- [ ] `npm run type-check` passes on main
- [ ] `npm run test` passes on main

During each phase:
- [ ] New route? Add Zod validation for inputs
- [ ] New Claude call? Goes through `lib/ai/claude.ts`, gets Langfuse trace
- [ ] New table access? Check RLS policy covers it
- [ ] Write unit test for any non-trivial function in `lib/`

Before merging each phase:
- [ ] `npm run lint` clean
- [ ] `npm run type-check` clean
- [ ] `npm run test` passes
- [ ] Manual smoke test of the feature

## Commit Discipline

Each phase is one PR. Commit atomically within the phase:
```
feat(p1): add artifact upload to Vercel Blob
feat(p1): gallery page with artifact cards
feat(p1): artifact viewer for html/image/pdf
feat(p1): github oauth with supabase auth
```

The challenge reviewers look at commit history — small, clear commits beat one giant squash.

---

# Hat 4 — QA Engineer

## Integration Test Plan (Playwright)

Tests live in `tests/integration/`. Run against the Vercel preview URL via `PLAYWRIGHT_BASE_URL`.

### Flow 1: Upload → Browse → View
```
tests/integration/upload-browse-view.spec.ts

1. Sign in with GitHub (fixture user)
2. Navigate to /artifacts/upload
3. Upload each type: test.html, test.png, test.pdf
4. Verify each appears in gallery at /
5. Click each card → verify preview renders
6. Verify title/tags were auto-populated (Phase 5)
```

### Flow 2: Share → Public View → Expiry
```
tests/integration/share.spec.ts

1. Sign in, navigate to artifact detail
2. Click Share → set 1-hour expiry → copy link
3. Open link in new context (no auth cookies)
4. Verify artifact is viewable
5. [Longer-running, skip in CI]: verify expired link shows error page
```

### Flow 3: Feedback → Summary
```
tests/integration/feedback.spec.ts

1. Sign in, navigate to an artifact with no feedback
2. Submit 3 comments (varying ratings)
3. Verify all 3 appear in order
4. Verify feedback summary card appears after 3rd comment (Phase 5)
5. Verify summary contains meaningful text (not empty, not error)
```

### Flow 4: MCP Conversational Flow (manual, not automated)
```
1. Add MCP config to Claude Desktop (see WRITEUP.md §MCP)
2. "List my recent artifacts"
3. "Publish [blob URL] as a PDF titled 'Q3 Review'"
4. "Share it with a 48-hour link"
5. "Summarize the feedback on artifact [id]"
Verify: all return coherent responses with correct data
```

## Test Fixtures

```
tests/fixtures/
  test.html    # Simple HTML with identifiable title
  test.png     # 200x200 solid color image
  test.pdf     # Single-page PDF with text "Quarterly Report Test"
```

---

# Hat 5 — Deployment Engineer

## Vercel Deployment

### One-time setup

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link
# → select your Vercel account + create new project "artifact-hub"

# Set environment variables (do this for Production + Preview envs)
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add ANTHROPIC_API_KEY
vercel env add LANGFUSE_SECRET_KEY
vercel env add LANGFUSE_PUBLIC_KEY
vercel env add LANGFUSE_HOST
vercel env add NEXT_PUBLIC_APP_URL   # → your vercel.app URL
vercel env add MCP_API_KEY
```

### Deploy

```bash
# Preview deploy (every PR)
git push origin feature/phase-1
# → Vercel auto-deploys preview, posts URL to PR

# Production deploy
git push origin main
# → Vercel auto-deploys to production
```

### Supabase Auth callback URL

After production deploy, add to Supabase → Auth → URL Configuration:
```
Site URL: https://your-project.vercel.app
Redirect URLs: https://your-project.vercel.app/auth/callback
               https://*.vercel.app/auth/callback  (for previews)
```

### MCP server config for reviewers

```json
{
  "mcpServers": {
    "artifact-hub": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-http-client"],
      "env": {
        "MCP_SERVER_URL": "https://your-project.vercel.app/api/mcp",
        "MCP_API_KEY": "the-shared-secret-from-reviewer-brief"
      }
    }
  }
}
```

> Note: The simpler approach is an HTTP-based MCP config that Claude Desktop supports natively via `url` + `headers` — check the MCP SDK docs at implementation time for the exact shape.

### Deployment checklist (Phase 6)

- [ ] All env vars set in Vercel dashboard (Production + Preview)
- [ ] `vercel build` passes locally
- [ ] Production URL loads gallery page
- [ ] Upload flow works on production
- [ ] Share link works in incognito on production
- [ ] MCP server responds to `curl -X POST .../api/mcp -H "Authorization: Bearer $KEY"`
- [ ] Langfuse shows traces from production calls
- [ ] Vercel Analytics shows page views

---

## Monitoring

| Signal | Where |
|---|---|
| LLM latency + cost | Langfuse → Traces dashboard |
| App errors | Vercel → Functions → Logs |
| Page performance | Vercel Analytics + Speed Insights |
| DB query perf | Supabase → Database → Query Performance |

No alerting configured (2-day challenge scope). With another week: add Langfuse alerts for p95 > 5s and Vercel error rate alerts.
