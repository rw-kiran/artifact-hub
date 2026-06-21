// Triggers AI indexing for all artifacts with index_status !== 'indexed'
// Run: node scripts/ingest-all.mjs
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load env from .env.prod.local
const envPath = resolve(process.cwd(), '.env.prod.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.match(/^([^=]+)=(.*)$/)?.slice(1) ?? [])
    .filter(([k]) => k)
    .map(([k, v]) => [k.trim(), v.replace(/^["']|["']$/g, '').trim()])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY })

const CHUNK_SIZE = 512
const OVERLAP = 50
const EMBED_MODEL = 'gemini-embedding-001'
const DIMS = 1536

function splitWords(text) {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const chunks = []
  for (let i = 0; i < words.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '))
    if (i + CHUNK_SIZE >= words.length) break
  }
  return chunks
}

async function extractHtml(url) {
  const html = await fetch(url).then(r => r.text())
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 20000)
}

async function extractPdf(url) {
  const buf = await fetch(url).then(r => r.arrayBuffer())
  const base64 = Buffer.from(buf).toString('base64')
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2048,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: 'Extract all text content from this PDF. Return only the extracted text, no commentary.' },
    ]}],
  })
  return msg.content[0]?.type === 'text' ? msg.content[0].text : ''
}

async function extractImage(url) {
  const buf = await fetch(url).then(r => r.arrayBuffer())
  const base64 = Buffer.from(buf).toString('base64')
  const mimeType = url.match(/\.png(\?|$)/i) ? 'image/png'
    : url.match(/\.gif(\?|$)/i) ? 'image/gif'
    : url.match(/\.webp(\?|$)/i) ? 'image/webp'
    : 'image/jpeg'
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 512,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      { type: 'text', text: 'Describe this image in detail for semantic search purposes. Include subjects, colors, text visible, and overall theme.' },
    ]}],
  })
  return msg.content[0]?.type === 'text' ? msg.content[0].text : ''
}

async function embedTexts(texts) {
  if (!texts.length) return []
  const all = []
  for (let i = 0; i < texts.length; i += 100) {
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: texts.slice(i, i + 100),
      config: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: DIMS },
    })
    all.push(...(res.embeddings ?? []).map(e => e.values ?? []))
  }
  return all
}

async function ingest(id, blobUrl, type) {
  console.log(`  extracting ${type}...`)
  const text = type === 'html' ? await extractHtml(blobUrl)
    : type === 'pdf' ? await extractPdf(blobUrl)
    : await extractImage(blobUrl)

  if (!text.trim()) {
    await supabase.from('artifacts').update({ index_status: 'failed' }).eq('id', id)
    console.log(`  ✗ empty extraction`)
    return
  }

  const chunks = splitWords(text).filter(t => t.trim())
  console.log(`  embedding ${chunks.length} chunks...`)
  const embeddings = await embedTexts(chunks)

  await supabase.from('artifact_chunks').delete().eq('artifact_id', id)
  const rows = chunks.map((content, i) => ({
    artifact_id: id,
    chunk_index: i,
    content,
    embedding: `[${(embeddings[i] ?? []).join(',')}]`,
    token_count: Math.ceil(content.length / 4),
  }))
  const { error } = await supabase.from('artifact_chunks').insert(rows)
  if (error) throw error

  await supabase.from('artifacts').update({ index_status: 'indexed' }).eq('id', id)
  console.log(`  ✓ indexed ${rows.length} chunks`)
}

// Fetch all artifacts
const { data: artifacts, error } = await supabase
  .from('artifacts')
  .select('id, title, blob_url, type, index_status')
  .order('created_at')

if (error) { console.error(error); process.exit(1) }

console.log(`Found ${artifacts.length} artifacts\n`)

for (const a of artifacts) {
  console.log(`[${a.type}] ${a.title} (${a.index_status})`)
  try {
    await ingest(a.id, a.blob_url, a.type)
  } catch (err) {
    console.error(`  ✗ error: ${err.message}`)
    await supabase.from('artifacts').update({ index_status: 'failed' }).eq('id', a.id)
  }
  console.log()
}

console.log('Done.')
