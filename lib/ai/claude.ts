import Anthropic from '@anthropic-ai/sdk'
import { Langfuse } from 'langfuse'
import { z } from 'zod'

if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'test') {
  console.warn(JSON.stringify({ event: 'anthropic_missing_key', note: 'Required for Phase 5 AI features' }))
}
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

// ponytail: langfuse is null in dev if keys are absent; Phase 5 makes it required
export let langfuse: Langfuse | null = null
if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
  langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
  })
} else if (process.env.NODE_ENV !== 'test') {
  console.warn(JSON.stringify({ event: 'langfuse_missing_keys' }))
}

const MetadataSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  tags: z.array(z.string().max(50)).max(10),
})

export async function generateMetadataFromText(
  text: string,
  type: string,
): Promise<{ title: string; description: string; tags: string[] }> {
  const trace = langfuse?.trace({ name: 'generate-metadata', input: { type } })
  const generation = trace?.generation({ name: 'claude-metadata', model: 'claude-sonnet-4-6' })

  const prompt = `You are analyzing an artifact to generate metadata. Here is its content:\n\n${text.slice(0, 6000)}\n\nReturn a JSON object with:\n- title: a concise, descriptive title (max 100 chars)\n- description: a 1-2 sentence description suitable for a gallery (max 300 chars)\n- tags: an array of 3-7 relevant lowercase single-word tags\n\nReturn ONLY the JSON object, no markdown.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  generation?.end({ output: raw })
  langfuse?.flushAsync()

  try {
    const parsed = MetadataSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\n?|```$/g, '').trim()))
    return parsed
  } catch {
    return { title: 'Untitled', description: '', tags: [] }
  }
}

// ponytail: thin wrapper for callers that haven't pre-extracted text
export async function generateMetadata(
  blobUrl: string,
  type: string,
): Promise<{ title: string; description: string; tags: string[] }> {
  const { extractContent } = await import('./extract')
  const text = await extractContent(blobUrl, type as 'html' | 'image' | 'pdf')
  return generateMetadataFromText(text, type)
}

export async function summarizeFeedback(artifactId: string): Promise<string | null> {
  const { createServerSupabaseClient } = await import('@/lib/db/supabase')
  const supabase = createServerSupabaseClient()

  const { data: rows } = await supabase
    .from('feedback')
    .select('content, rating')
    .eq('artifact_id', artifactId)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!rows || rows.length < 2) return null

  const trace = langfuse?.trace({ name: 'summarize-feedback', input: { artifactId, count: rows.length } })
  const generation = trace?.generation({ name: 'claude-summary', model: 'claude-sonnet-4-6' })

  const commentList = rows
    .map((r, i) => `${i + 1}. ${r.rating != null ? `[${r.rating}/5] ` : ''}${r.content}`)
    .join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Summarize the following feedback for an artifact in 2-3 sentences. Note the overall sentiment and key themes.\n\nFeedback:\n${commentList}\n\nReturn only the summary paragraph, no labels.`,
    }],
  })

  const summary = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
  generation?.end({ output: summary ?? '' })

  if (summary) {
    await supabase.from('artifacts').update({ feedback_summary: summary }).eq('id', artifactId)
  }

  langfuse?.flushAsync()
  return summary
}
