# Artifact Hub — Feature Coverage & Use Cases

All product surfaces, web UI flows, AI features, and MCP tool chains.

---

## What is Artifact Hub

Artifact Hub is a platform for publishing, browsing, reviewing, and sharing AI-generated content — HTML pages, images, and PDFs. It provides a persistent, searchable home for content that otherwise ends up in blob storage with no browse, no feedback mechanism, and no access control beyond a raw expiring URL.

**Who it's for:** Product and engineering teams who generate AI output (mockups, reports, dashboards, presentations) and need a structured way to manage its lifecycle — from publishing to review to sharing with stakeholders.

---

## Web UI flows

### Publish an artifact

1. Sign in with GitHub
2. Navigate to **Upload** (`/artifacts/upload`)
3. Drop a file or browse — supports `.html`, `.png`, `.jpg`, `.gif`, `.webp`, `.pdf` (max 50 MB)
4. Click **Upload artifact**
5. The system stores the file to Vercel Blob, creates a DB record, and triggers Claude to generate title, description, and tags automatically
6. You land on the artifact detail page with metadata already populated — edit if needed

**Visibility:** Artifacts are public by default. Toggle to private at upload time or edit later — private artifacts are only visible to their owner.

### Browse the gallery

- The homepage (`/`) shows all public artifacts in reverse-chronological order
- Filter by type: HTML, Image, PDF using the type buttons
- Filter by tag: click any tag in the gallery to filter
- Real-time search: type in the search bar for natural language search (see AI Features)
- Pagination: 20 artifacts per page

### View an artifact

- HTML artifacts render in a sandboxed iframe (scripts allowed, same-origin blocked to prevent XSS via artifact content)
- Images render natively
- PDFs render via `<embed>`
- Below the viewer: title, description, tags, creator, and the feedback thread with AI summary

### Share an artifact

1. Open an artifact detail page
2. Click **Share** — a modal appears
3. Set expiry: 1 hour to 168 hours (7 days)
4. Click **Generate link**
5. The share URL (`/share/[token]`) is accessible without authentication
6. After expiry, the link returns 404

### Leave feedback

1. Open an artifact detail page
2. Scroll to the **Feedback** panel
3. Write a comment and optionally set a star rating (1–5)
4. Click **Submit**
5. The AI summary above the thread updates within a few seconds to reflect the new comment

### Manage MCP API keys

1. Navigate to **Settings** (`/settings/mcp`)
2. Click **Generate API Key** — name it and copy the key (shown once)
3. Add the key to Claude Desktop or Cursor config (setup snippet shown on the page)
4. Revoke keys anytime — revoked keys are rejected immediately

---

## AI features

All three AI features are invisible by design — they improve the product without surfacing "AI" as the point.

### Auto-metadata on upload

**What:** After a file is uploaded and stored, Claude reads the content and returns structured `{ title, description, tags }`. The result is written back to the artifact record.

**How content is read:**
- HTML: scripts and styles stripped, text extracted (20 KB cap)
- PDF: passed to Claude as a base64 document block (20 MB buffer cap)
- Image: passed to Claude as a base64 vision block

**When it fires:** Immediately after `POST /api/artifacts` — runs in the background, typically completes before the user finishes reading the redirect.

**User impact:** The artifact detail page shows meaningful metadata without any manual input. Users edit the generated metadata ~10% of the time.

### Feedback summary

**What:** When any feedback is submitted (web or MCP), Claude reads all comments for that artifact and writes 2–3 sentences summarizing the consensus. Stored as `feedback_summary` on the artifact.

**When it fires:** Via `after()` — asynchronously after `POST /api/feedback` returns 201. Does not block the user's submit action.

**When it shows:** If fewer than 2 comments exist, the summary panel shows "Not enough feedback yet." Once the summary exists, it appears above the comment thread on the artifact detail page.

**User impact:** Artifact owners and viewers see the consensus at a glance without reading every comment.

### Hybrid natural language search

**What:** The search bar accepts natural language queries. Behind the scenes:
1. The query is embedded via Google `text-embedding-004` (1536d vector)
2. `hybrid_search()` Postgres RPC runs BM25 full-text and cosine similarity in parallel, returning a ranked union
3. If candidates exceed the result limit, Claude reranks them by semantic relevance to the original query

**When it fires:** On every search query via `GET /api/search?q=…`

**Fallback:** If the embedding call fails, the system falls back to Postgres full-text search only.

**User impact:** "Find the revenue report from last quarter" works without knowing the exact title or tags. BM25 catches exact title matches; semantic search catches intent that doesn't appear in the text.

---

## MCP tool reference

The MCP server lives at `/api/mcp`. Auth: `Authorization: Bearer <api-key>` on every request.

### `publish_artifact`

Fetch a file from a public URL and publish it as an artifact.

```
publish_artifact(
  url: string,              // public URL of the file to publish
  title?: string,           // optional; auto-generated by Claude if omitted
  description?: string,     // optional; auto-generated if omitted
  tags?: string[],          // optional; auto-generated if omitted
  visibility?: "public" | "private"  // default: "public"
)
```

- SSRF-safe: validates every redirect hop against private IP ranges
- MIME type validated against whitelist: `text/html`, `image/*`, `application/pdf`
- Metadata auto-generated after publish if title/description/tags are omitted
- Returns: `{ artifact_id, title, url }`

### `list_artifacts`

Browse the gallery with optional filters.

```
list_artifacts(
  type?: "html" | "image" | "pdf",
  tag?: string,
  limit?: number  // default: 10, max: 50
)
```

- Returns public artifacts only
- Returns: array of `{ id, title, description, tags, type, created_at, creator_name }`

### `get_artifact`

Fetch a single artifact by ID, title, or tags.

```
get_artifact(
  artifact_id?: string,  // UUID
  title?: string,         // fuzzy match
  tags?: string[]         // filter by tags
)
```

- When title matches multiple artifacts, returns `{ candidates: [...] }` for disambiguation
- Returns full artifact including feedback thread and feedback_summary

### `search_artifacts`

Natural language search across the catalog.

```
search_artifacts(
  query: string,
  limit?: number  // default: 5
)
```

- Hybrid BM25 + semantic — same pipeline as the web search bar
- Returns: array of `{ id, title, description, similarity_score }`

### `share_artifact`

Generate a time-limited share link.

```
share_artifact(
  artifact_id?: string,
  query?: string,          // fuzzy search if artifact_id not known
  expires_in_hours?: number  // default: 24, max: 168
)
```

- Returns `{ share_url, expires_at }`
- If `query` matches multiple artifacts, returns `{ candidates: [...] }` for disambiguation

### `add_feedback`

Leave a comment and optional star rating.

```
add_feedback(
  artifact_id: string,
  content: string,
  rating?: number  // 1–5
)
```

- Automatically triggers AI feedback summary regeneration in the background
- Returns: `{ feedback_id, summary_updated: true }`

### `summarize_feedback`

Get the AI-generated feedback summary for an artifact.

```
summarize_feedback(
  artifact_id: string
)
```

- Returns cached summary if available; triggers regeneration if stale
- Returns `"Not enough feedback yet"` if fewer than 2 comments exist

---

## MCP use case matrix

### Single tool

| Use case | Prompt example | Tool |
|---|---|---|
| Browse the gallery | "Show me all artifacts" | `list_artifacts` |
| Browse by type | "List all PDFs" | `list_artifacts(type=pdf)` |
| Browse by tag | "What has the 'design' tag?" | `list_artifacts(tag=design)` |
| Keyword / NL search | "Find artifacts about dashboards" | `search_artifacts` |
| Publish from URL | "Publish this image: https://…" | `publish_artifact` |
| Publish with metadata | "Publish this HTML as 'Q4 Dashboard', tag it 'finance'" | `publish_artifact(title, tags)` |

### 2-step chains

| Use case | Prompt example | Tool chain |
|---|---|---|
| Look up artifact details | "Tell me about the Pikachu artifact" | `search_artifacts` → `get_artifact` |
| Look up by title | "Get me the landing page artifact" | `get_artifact(title=…)` |
| Share a specific artifact | "Share the landing page artifact" | `share_artifact(query=…)` |
| Leave a review | "Give 4 stars to the data viz artifact" | `search_artifacts` → `add_feedback` |
| Read AI summary | "What do people think about the chart artifact?" | `search_artifacts` → `summarize_feedback` |
| Publish then share | "Publish this PDF and send me a link" | `publish_artifact` → `share_artifact` |
| Publish then annotate | "Publish this mockup, add a note it needs accessibility work" | `publish_artifact` → `add_feedback` |
| Check rating of latest | "What's the feedback on the newest artifact?" | `list_artifacts(limit=1)` → `summarize_feedback` |

### Multi-step flows

| Use case | Prompt example | Tool chain |
|---|---|---|
| Publish → review → share | "Upload this mockup, rate it 5 stars, share it with the team" | `publish_artifact` → `add_feedback` → `share_artifact` |
| Curated recommendations | "Find good HTML artifacts and pick the top-rated one" | `list_artifacts` → `get_artifact` → `summarize_feedback` |
| Peer review workflow | "Find the report artifact, review it, then show me the summary" | `search_artifacts` → `get_artifact` → `add_feedback` → `summarize_feedback` |
| Share with expiry | "Find the Q4 report, create a 48h link for Slack" | `search_artifacts` → `share_artifact(expires_in_hours=48)` |
| Publish batch | "Publish these 3 images: [url1] [url2] [url3]" | `publish_artifact` × 3 in sequence |
| Browse → compare → pick | "Show all PDFs, read the top 3, tell me which has best feedback" | `list_artifacts` → `get_artifact` × 3 → `summarize_feedback` × 3 |

### Human-in-the-loop (ambiguous inputs)

| Trigger | What Claude does | Tool behavior |
|---|---|---|
| Vague name matches multiple | "Share the report" → 4 artifacts have 'report' in title | `share_artifact` returns `candidates` → Claude asks to pick → re-calls with `artifact_id` |
| Title search returns multiple | "Get me the dashboard artifact" → 3 matches | `get_artifact` returns `candidates` → Claude asks to confirm |
| No identifier given | "Share an artifact" | `share_artifact` returns clarification prompt |

---

## Coverage gaps (no MCP tool today)

| Missing use case | What would be needed | Workaround |
|---|---|---|
| Edit artifact title/description/tags | `update_artifact` tool | Edit in web UI → artifact detail page |
| Delete an artifact | `delete_artifact` tool | Web UI only (safer — no accidental chat deletion) |
| List own private artifacts | `list_artifacts` scope limited to public | Web UI gallery shows your private artifacts when signed in |
| Upload a local file directly | MCP has no binary transport (protocol limit) | Host file publicly → `publish_artifact(url=…)` |
| Delete / edit a comment | `delete_feedback` / `update_feedback` tools | No workaround today |

---

*Artifact Hub · Last updated 2026-06-21*
