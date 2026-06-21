import { GoogleGenAI } from '@google/genai'

if (!process.env.GOOGLE_API_KEY && process.env.NODE_ENV !== 'test') {
  console.warn(JSON.stringify({ event: 'google_ai_missing_key', note: 'Required for RAG search' }))
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? '' })
const MODEL = 'gemini-embedding-001'
const DIMS = 1536
const BATCH_SIZE = 100  // Gemini per-request item cap

export async function embedTexts(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  if (texts.length === 0) return []
  const all: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const response = await ai.models.embedContent({
      model: MODEL,
      contents: texts.slice(i, i + BATCH_SIZE),
      config: { taskType, outputDimensionality: DIMS },
    })
    all.push(...(response.embeddings ?? []).map(e => e.values ?? []))
  }
  return all
}
