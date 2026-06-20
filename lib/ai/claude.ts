import Anthropic from '@anthropic-ai/sdk'
import { Langfuse } from 'langfuse'

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

export async function generateMetadata(
  _blobUrl: string,
  _contentType: string,
): Promise<{ title: string; description: string; tags: string[] }> {
  throw new Error('Not implemented until Phase 5')
}

export async function summarizeFeedback(_artifactId: string): Promise<string> {
  throw new Error('Not implemented until Phase 5')
}
