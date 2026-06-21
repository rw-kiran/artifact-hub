import { embedTexts } from './embed'
import { anthropic, langfuse } from './claude'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import type { Artifact, ArtifactType } from '@/lib/types'

interface HybridRow {
  artifact_id: string
  title: string
  description: string
  type: string
  tags: string[]
  blob_url: string
  creator_name: string | null
  created_at: string
  rrf_score: number
  min_cosine_dist: number | null  // null = BM25-only result (no semantic chunk matched)
}

// Cosine distance ceiling for the semantic leg of hybrid_search.
// Cosine distance ranges 0 (identical) → 2 (opposite); in practice for
// retrieval embeddings, >0.7 is unrelated content.  Lower = stricter.
const SIMILARITY_THRESHOLD = 0.40

export async function hybridSearch(
  query: string,
  opts?: { type?: ArtifactType; limit?: number },
): Promise<Artifact[]> {
  const limit = Math.min(opts?.limit ?? 10, 50)
  const supabase = createServerSupabaseClient()
  const trace = langfuse?.trace({ name: 'hybrid-search', input: { query, limit } })

  try {
    let candidates: HybridRow[] = []

    // ── Semantic + BM25 hybrid ────────────────────────────────────────────────
    try {
      const vecs = await embedTexts([query], 'RETRIEVAL_QUERY')
      const queryVec = vecs[0]
      if (queryVec?.length) {
        const { data, error } = await supabase.rpc('hybrid_search', {
          query_embedding: `[${queryVec.join(',')}]`,
          query_text: query,
          match_count: Math.max(20, limit * 2),
          max_distance: SIMILARITY_THRESHOLD,
        }) as { data: HybridRow[] | null; error: unknown }

        if (!error && data?.length) {
          // Log distances in dev to calibrate SIMILARITY_THRESHOLD
          if (process.env.NODE_ENV === 'development') {
            console.log(JSON.stringify({
              event: 'hybrid_distances',
              query,
              candidates: data.map(c => ({ title: c.title.slice(0, 40), dist: c.min_cosine_dist, score: c.rrf_score })),
            }))
          }
          // TypeScript-side filter: belt-and-suspenders alongside the SQL max_distance.
          // BM25-only results (dist=null) always pass — keyword match is reliable.
          candidates = data.filter(c => c.min_cosine_dist === null || c.min_cosine_dist < SIMILARITY_THRESHOLD)
        }
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'hybrid_search_error', error: String(err) }))
    }

    // ── FTS fallback ──────────────────────────────────────────────────────────
    if (!candidates.length) {
      const { data } = await supabase
        .from('artifacts')
        .select('*')
        .eq('visibility', 'public')
        .textSearch('search_vector', query, { type: 'websearch' })
        .limit(20)
      candidates = (data ?? []).map(a => ({
        artifact_id: a.id,
        title: a.title,
        description: a.description,
        type: a.type,
        tags: a.tags,
        blob_url: a.blob_url,
        creator_name: a.creator_name,
        created_at: a.created_at,
        rrf_score: 0,
        min_cosine_dist: null,  // FTS results are keyword matches — no distance concept
      }))
    }

    // ── Type filter ───────────────────────────────────────────────────────────
    if (opts?.type) {
      candidates = candidates.filter(c => c.type === opts.type)
    }

    if (!candidates.length) return []

    // ── Claude reranker (only if we have more candidates than the limit) ──────
    if (candidates.length > limit) {
      try {
        const list = candidates
          .map((c, i) => `${i + 1}. [${c.type}] ${c.title}: ${c.description}`)
          .join('\n')

        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Query: "${query}"\n\nCandidates:\n${list}\n\nReturn a JSON array of the ${limit} most relevant candidate numbers in order of relevance. Example: [3,1,5]. Return ONLY the JSON array, nothing else.`,
          }],
        })

        const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
        const match = text.match(/\[[\d,\s]+\]/)
        if (match) {
          const ranked = JSON.parse(match[0]) as number[]
          const reranked = ranked
            .filter(i => i >= 1 && i <= candidates.length)
            .slice(0, limit)
            .map(i => candidates[i - 1])
            .filter(Boolean)
          if (reranked.length) candidates = reranked
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'rerank_error', error: String(err) }))
        // fallback: take top-limit from RRF scores
      }
    }

    const ids = candidates.slice(0, limit).map(c => c.artifact_id)

    // Fetch full artifact rows (RPC returns a subset of columns)
    const { data: artifacts } = await supabase.from('artifacts').select('*').in('id', ids)
    if (!artifacts?.length) return []

    // Preserve reranked order
    const byId = new Map(artifacts.map(a => [a.id, a as Artifact]))
    const result = ids.map(id => byId.get(id)).filter((a): a is Artifact => a != null)

    trace?.update({ output: { count: result.length } })
    return result
  } finally {
    langfuse?.flushAsync()
  }
}
