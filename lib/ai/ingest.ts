import { SentenceSplitter, Document } from 'llamaindex'
import { embedTexts } from './embed'
import { extractContent } from './extract'
import { langfuse } from './claude'
import { createServerSupabaseClient } from '@/lib/db/supabase'
import type { ArtifactType } from '@/lib/types'

const splitter = new SentenceSplitter({ chunkSize: 512, chunkOverlap: 50 })

export async function ingestArtifact(
  artifactId: string,
  blobUrl: string,
  type: ArtifactType,
): Promise<void> {
  const trace = langfuse?.trace({ name: 'ingest-artifact', input: { artifactId, type } })
  // Outside try so catch can update status even when setup fails
  const supabase = createServerSupabaseClient()
  try {
    // Idempotent: clear existing chunks before re-ingesting
    await supabase.from('artifact_chunks').delete().eq('artifact_id', artifactId)

    // All types: extract text first (Claude vision for images/PDF, HTML strip for html)
    // then chunk and embed uniformly — no multimodal embedding path needed
    const text = await extractContent(blobUrl, type)
    if (!text.trim()) {
      await supabase.from('artifacts').update({ index_status: 'failed' }).eq('id', artifactId)
      return
    }

    const nodes = splitter.getNodesFromDocuments([new Document({ text })])
    const chunkTexts = nodes.map(n => n.getText()).filter(t => t.trim())
    if (!chunkTexts.length) {
      await supabase.from('artifacts').update({ index_status: 'failed' }).eq('id', artifactId)
      return
    }

    const embeddings = await embedTexts(chunkTexts)
    if (embeddings.length !== chunkTexts.length) {
      throw new Error(`embedding count mismatch: expected ${chunkTexts.length}, got ${embeddings.length}`)
    }
    const rows = chunkTexts.map((content, i) => ({
      artifact_id: artifactId,
      chunk_index: i,
      content,
      embedding: `[${(embeddings[i] ?? []).join(',')}]`,
      token_count: Math.ceil(content.length / 4),
    }))

    const { error } = await supabase.from('artifact_chunks').insert(rows)
    if (error) throw error

    await supabase.from('artifacts').update({ index_status: 'indexed' }).eq('id', artifactId)
    trace?.update({ output: { chunks: rows.length } })
  } catch (err) {
    // Never throw — ingest failure must not surface to the user
    console.error(JSON.stringify({ event: 'ingest_error', artifactId, error: String(err) }))
    try {
      await supabase.from('artifacts').update({ index_status: 'failed' }).eq('id', artifactId)
    } catch { /* best-effort */ }
  } finally {
    await langfuse?.flushAsync()
  }
}
