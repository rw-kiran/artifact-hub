import { anthropic, langfuse } from './claude'
import type { ArtifactType } from '@/lib/types'

export async function extractContent(blobUrl: string, type: ArtifactType): Promise<string> {
  const trace = langfuse?.trace({ name: 'extract-content', input: { type } })
  try {
    if (type === 'html') {
      return await extractHtml(blobUrl)
    }
    const generation = trace?.generation({ name: 'claude-extract', model: 'claude-sonnet-4-6' })
    const text = type === 'pdf'
      ? await extractPdf(blobUrl)
      : await extractImage(blobUrl)
    generation?.end({ output: text.slice(0, 200) })
    return text
  } catch (err) {
    console.error(JSON.stringify({ event: 'extract_error', type, error: String(err) }))
    return ''
  } finally {
    await langfuse?.flushAsync()
  }
}

async function extractHtml(blobUrl: string): Promise<string> {
  const html = await fetch(blobUrl).then(r => r.text())
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000)
}

async function extractPdf(blobUrl: string): Promise<string> {
  const bytes = await fetch(blobUrl).then(r => r.arrayBuffer())
  const base64 = Buffer.from(bytes).toString('base64')
  // Anthropic SDK types: document block requires explicit cast in mixed-content arrays
  type DocBlock = { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  type TextBlock = { type: 'text'; text: string }
  const content: (DocBlock | TextBlock)[] = [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    { type: 'text', text: 'Extract all text content from this PDF. Return only the extracted text, no commentary.' },
  ]
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: content as Parameters<typeof anthropic.messages.create>[0]['messages'][0]['content'] }],
  })
  const block = msg.content[0]
  return block?.type === 'text' ? block.text : ''
}

async function extractImage(blobUrl: string): Promise<string> {
  const bytes = await fetch(blobUrl).then(r => r.arrayBuffer())
  const base64 = Buffer.from(bytes).toString('base64')
  // Infer mime from URL; Blob URLs usually carry the extension
  const mimeType = blobUrl.match(/\.png(\?|$)/i) ? 'image/png'
    : blobUrl.match(/\.gif(\?|$)/i) ? 'image/gif'
    : blobUrl.match(/\.webp(\?|$)/i) ? 'image/webp'
    : 'image/jpeg'
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: 'Describe this image in detail for semantic search purposes. Include subjects, colors, text visible, and overall theme.' },
      ],
    }],
  })
  const block = msg.content[0]
  return block?.type === 'text' ? block.text : ''
}
