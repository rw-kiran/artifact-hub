import { EdgeFastMCP } from 'fastmcp/edge'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import { ALLOWED_MIME_TYPES, isAllowedMimeType } from '@/lib/validation'
import { isPrivateUrl } from '@/lib/ssrf'
import { isFkViolation, assertUuid } from '@/lib/mcp/utils'
import { hybridSearch } from '@/lib/ai/search'
import type { ArtifactType } from '@/lib/types'

export const mcpServer = new EdgeFastMCP({
  name: 'artifact-hub',
  version: '1.0.0',
  mcpPath: '/api/mcp',
})

function mimeToType(mime: string): ArtifactType | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'text/html') return 'html'
  if (mime === 'application/pdf') return 'pdf'
  return null
}

mcpServer.addTool({
  name: 'publish_artifact',
  description: 'Publish a new artifact to the hub from a remote URL. Supports HTML, images (JPEG, PNG, GIF, WebP), and PDFs up to 50 MB.',
  parameters: z.object({
    url: z.string().url().describe('URL of the file to publish'),
    title: z.string().max(200).optional().describe('Human-readable title (auto-detected if omitted)'),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    visibility: z.enum(['public', 'private']).default('public'),
  }),
  execute: async ({ url, title, description, tags, visibility }) => {
    if (isPrivateUrl(url)) {
      throw new Error(`Cannot publish from private or internal URLs. Provide a public URL.`)
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArtifactHub/1.0)' },
    })
    if (!response.ok) throw new Error(`Failed to fetch URL: HTTP ${response.status}. The server rejected the request — try a direct CDN URL instead.`)

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!isAllowedMimeType(contentType)) {
      throw new Error(`Unsupported file type "${contentType}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`)
    }
    const type = mimeToType(contentType)
    if (!type) throw new Error(`Internal: mimeToType returned null for allowed MIME "${contentType}"`)

    const filename = url.split('/').pop()?.split('?')[0] ?? 'artifact'
    const { url: blobUrl, pathname } = await put(filename, response.body!, {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    })

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('artifacts')
      .insert({
        blob_url: blobUrl,
        blob_pathname: pathname,
        type,
        title: title ?? filename,
        description: description ?? '',
        tags: tags ?? [],
        visibility,
        created_by: null,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to save artifact: ${error.message}`)
    return JSON.stringify({ id: data.id, title: data.title, type: data.type, url: blobUrl, visibility: data.visibility })
  },
})

mcpServer.addTool({
  name: 'list_artifacts',
  description: 'List public artifacts in the hub. Optionally filter by type or tag.',
  parameters: z.object({
    type: z.enum(['html', 'image', 'pdf']).optional().describe('Filter by artifact type'),
    tag: z.string().optional().describe('Filter by tag'),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  execute: async ({ type, tag, limit }) => {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('artifacts')
      .select('id, title, type, tags, blob_url, creator_name, visibility, created_at')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(limit ?? 20)

    if (type) query = query.eq('type', type)
    if (tag) query = query.contains('tags', [tag])

    const { data, error } = await query
    if (error) throw new Error(`Failed to list artifacts: ${error.message}`)
    if (!data?.length) return 'No artifacts found.'
    return JSON.stringify(data)
  },
})

mcpServer.addTool({
  name: 'get_artifact',
  description: 'Get details of an artifact including feedback. Accepts an exact ID, or searches by title/tags when the ID is unknown. If multiple artifacts match, returns a candidate list — ask the user which one they mean, then call again with the specific id.',
  parameters: z.object({
    id: z.string().optional().describe('Exact artifact UUID'),
    title: z.string().optional().describe('Partial title to search for'),
    tags: z.array(z.string()).optional().describe('Tags to filter by'),
  }),
  execute: async ({ id, title, tags }) => {
    const supabase = createServerSupabaseClient()

    if (id) {
      // ponytail: fastmcp drops z.string().uuid() — validate manually
      assertUuid(id, 'artifact_id')

      const [artifactRes, feedbackRes] = await Promise.all([
        supabase.from('artifacts').select('*').eq('id', id).single(),
        supabase.from('feedback').select('*').eq('artifact_id', id).order('created_at', { ascending: true }),
      ])
      if (artifactRes.error || !artifactRes.data) {
        return `Artifact not found for id "${id}". Try searching by title or tags instead.`
      }
      return JSON.stringify({ ...artifactRes.data, feedback: feedbackRes.data ?? [] })
    }

    if (!title && (!tags || !tags.length)) {
      return 'Please provide an id, title, or tags to identify the artifact.'
    }

    let q = supabase
      .from('artifacts')
      .select('id, title, type, tags, description, created_at, blob_url')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(10)

    if (title) q = q.ilike('title', `%${title.replace(/[%_]/g, '\\$&')}%`)
    if (tags?.length) q = q.contains('tags', tags)

    const { data, error } = await q
    if (error) throw new Error(`Search failed: ${error.message}`)
    if (!data?.length) return `No artifacts found. Try different terms or use list_artifacts() to browse all.`

    if (data.length === 1) {
      const [artifactRes, feedbackRes] = await Promise.all([
        supabase.from('artifacts').select('*').eq('id', data[0].id).single(),
        supabase.from('feedback').select('*').eq('artifact_id', data[0].id).order('created_at', { ascending: true }),
      ])
      return JSON.stringify({ ...artifactRes.data, feedback: feedbackRes.data ?? [] })
    }

    return JSON.stringify({
      message: `Found ${data.length} artifacts matching your search. Ask the user which one they mean, then call get_artifact with the specific id.`,
      candidates: data.map(a => ({ id: a.id, title: a.title, type: a.type, tags: a.tags })),
    })
  },
})

mcpServer.addTool({
  name: 'search_artifacts',
  description: 'Search public artifacts using hybrid semantic + keyword search. Understands natural language queries and content meaning, not just title/description keywords.',
  parameters: z.object({
    query: z.string().min(1).describe('Natural language search query'),
    type: z.enum(['html', 'image', 'pdf']).optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  execute: async ({ query, type, limit }) => {
    const results = await hybridSearch(query, { type: type as ArtifactType | undefined, limit })
    if (!results.length) return `No artifacts found for "${query}".`
    return JSON.stringify(results.map(a => ({
      id: a.id, title: a.title, type: a.type, tags: a.tags, description: a.description, created_at: a.created_at,
    })))
  },
})

mcpServer.addTool({
  name: 'share_artifact',
  description: 'Create a time-limited shareable link for an artifact. Provide artifact_id for a direct share, or use query to search by title. If the query matches multiple artifacts, a candidate list is returned — ask the user to pick one, then call again with the specific artifact_id.',
  parameters: z.object({
    artifact_id: z.string().optional().describe('Exact artifact UUID to share'),
    query: z.string().optional().describe('Search term to find an artifact by title when the ID is unknown'),
    expires_in_hours: z.number().int().min(1).max(168).default(24).describe('Link validity in hours (max 168 = 7 days)'),
  }),
  execute: async ({ artifact_id, query, expires_in_hours }) => {
    const supabase = createServerSupabaseClient()
    let id = artifact_id

    if (id) {
      // ponytail: fastmcp drops z.string().uuid() — validate manually
      assertUuid(id, 'artifact_id')
    } else {
      if (!query) return 'Please provide either artifact_id or a query to find the artifact.'

      const escaped = query.replace(/[%_]/g, '\\$&')
      const { data } = await supabase
        .from('artifacts')
        .select('id, title, type, tags')
        .eq('visibility', 'public')
        .ilike('title', `%${escaped}%`)
        .limit(10)

      if (!data?.length) return `No artifacts found matching "${query}". Use list_artifacts() to browse.`

      if (data.length > 1) {
        return JSON.stringify({
          message: `Found ${data.length} artifacts matching "${query}". Ask the user which one they want to share, then call share_artifact with the specific artifact_id.`,
          candidates: data,
        })
      }
      id = data[0].id
    }

    const hours = expires_in_hours ?? 24
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('share_tokens')
      .insert({ artifact_id: id, expires_at: expiresAt })
      .select('token')
      .single()

    if (error) {
      if (isFkViolation(error.message)) {
        throw new Error(`Artifact not found. Use list_artifacts() to find valid artifact IDs.`)
      }
      throw new Error(`Failed to create share link: ${error.message}`)
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    return JSON.stringify({ url: `${appUrl}/share/${data.token}`, expires_in_hours: hours, expires_at: expiresAt })
  },
})

mcpServer.addTool({
  name: 'add_feedback',
  description: 'Leave a comment on an artifact, with an optional 1–5 star rating.',
  parameters: z.object({
    artifact_id: z.string().describe('Artifact ID to comment on'),
    content: z.string().min(10).max(1000).describe('Comment text (10–1000 characters)'),
    rating: z.number().int().min(1).max(5).optional().describe('Star rating (1 = worst, 5 = best)'),
    author_name: z.string().max(100).optional(),
    author_email: z.string().email().optional(),
  }),
  execute: async ({ artifact_id, content, rating, author_name, author_email }) => {
    // ponytail: fastmcp drops Zod constraints — guard manually
    assertUuid(artifact_id, 'artifact_id')
    if (!content || content.length < 10) {
      throw new Error(`Comment too short (${content?.length ?? 0} chars). Minimum is 10 characters.`)
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('feedback')
      .insert({
        artifact_id,
        content,
        rating: rating ?? null,
        author_name: author_name ?? 'MCP',
        author_email: author_email ?? 'noreply@artifact-hub.app',
      })
      .select('id, created_at')
      .single()

    if (error) {
      if (isFkViolation(error.message)) {
        throw new Error(`Artifact not found. Use list_artifacts() to find valid artifact IDs.`)
      }
      throw new Error(`Failed to add feedback: ${error.message}`)
    }
    return JSON.stringify({ id: data.id, created_at: data.created_at, message: 'Feedback added successfully.' })
  },
})

mcpServer.addTool({
  name: 'summarize_feedback',
  description: 'Get the AI-generated summary of feedback for an artifact. Returns existing summary or a prompt to add more comments.',
  parameters: z.object({
    artifact_id: z.string().describe('Artifact ID'),
  }),
  execute: async ({ artifact_id }) => {
    // ponytail: fastmcp drops z.string().uuid() — validate manually
    assertUuid(artifact_id, 'artifact_id')

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('artifacts')
      .select('id, title, feedback_summary')
      .eq('id', artifact_id)
      .single()

    if (error || !data) throw new Error(`Artifact not found. Call list_artifacts() to see available IDs.`)
    // ponytail: Phase 5 calls summarizeFeedback() from lib/ai/claude.ts when feedback_summary is null
    if (!data.feedback_summary) {
      return `No summary yet for "${data.title}". Add 3 or more comments via add_feedback() to generate one.`
    }
    return data.feedback_summary
  },
})
