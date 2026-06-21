import { z } from 'zod'
import { hybridSearch } from '@/lib/ai/search'
import type { ArtifactType } from '@/lib/types'

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['html', 'image', 'pdf']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const result = SearchParamsSchema.safeParse({
    q: searchParams.get('q'),
    type: searchParams.get('type') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })

  if (!result.success) {
    return Response.json({ error: 'Invalid query parameters', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { q, type, limit } = result.data

  try {
    const artifacts = await hybridSearch(q, { type: type as ArtifactType | undefined, limit })
    return Response.json({ artifacts, total: artifacts.length })
  } catch (err) {
    console.error(JSON.stringify({ event: 'search_route_error', error: String(err) }))
    return Response.json({ error: 'Search failed', code: 'SEARCH_ERROR' }, { status: 500 })
  }
}
