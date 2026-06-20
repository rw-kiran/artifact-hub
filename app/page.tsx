import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAuthClient } from '@/lib/db/supabase'
import { ArtifactCard } from '@/components/ArtifactCard'
import { SearchBar } from '@/components/SearchBar'
import Link from 'next/link'
import type { Artifact, ArtifactType } from '@/lib/types'

const TYPE_TABS = [
  { label: 'All', value: '' },
  { label: 'HTML', value: 'html' },
  { label: 'Image', value: 'image' },
  { label: 'PDF', value: 'pdf' },
]

function buildHref(p: { type?: string; q?: string; mine?: boolean; page?: number }) {
  const params = new URLSearchParams()
  if (p.type) params.set('type', p.type)
  if (p.q) params.set('q', p.q)
  if (p.mine) params.set('mine', 'true')
  if (p.page && p.page > 1) params.set('page', String(p.page))
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string; mine?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const type = sp.type as ArtifactType | undefined
  const q = sp.q

  const cookieStore = await cookies()
  const { data: { user } } = await createAuthClient({
    getAll: () => cookieStore.getAll(),
    set: () => {},
  }).auth.getUser()
  const isMine = sp.mine === 'true' && !!user

  let supabase: ReturnType<typeof createServerSupabaseClient>
  try {
    supabase = createServerSupabaseClient()
  } catch (e) {
    console.error('[GalleryPage] supabase client error', e)
    return <main className="p-8 text-red-600">DB client error — check server logs</main>
  }

  const from = (page - 1) * 20
  let query = supabase
    .from('artifacts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, from + 19)

  if (isMine) {
    query = query.eq('created_by', user!.id)
  } else {
    query = query.eq('visibility', 'public')
  }

  if (type && ['html', 'image', 'pdf'].includes(type)) query = query.eq('type', type)
  if (q) {
    const safe = q.replace(/[(),]/g, '')
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  const { data: artifacts, error: dbError } = await Promise.race([
    query,
    new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('DB timeout') }), 5000)
    ),
  ])

  if (dbError) {
    console.error(JSON.stringify({ event: 'gallery_query_error', error: dbError.message }))
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col gap-6">
        <SearchBar defaultValue={q} />
        <div className="flex gap-2 flex-wrap items-center">
          {TYPE_TABS.map(({ label, value }) => (
            <Link
              key={value}
              href={buildHref({ type: value || undefined, q, mine: isMine })}
              className={`px-3 py-1.5 text-sm rounded-md ${
                (sp.type ?? '') === value && !isMine
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </Link>
          ))}
          {user && (
            <>
              <span className="text-gray-300 select-none">|</span>
              <Link
                href={buildHref({ type: sp.type, q, mine: !isMine })}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  isMine ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                My uploads
              </Link>
            </>
          )}
        </div>

        {!artifacts?.length ? (
          <div className="text-center py-16 text-gray-400">
            {isMine ? "You haven't uploaded anything yet." : 'No artifacts yet.'}{' '}
            <Link href="/artifacts/upload" className="text-black underline">
              Upload one
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {artifacts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact as Artifact} />
            ))}
          </div>
        )}

        {artifacts && artifacts.length === 20 && (
          <div className="flex justify-center gap-4">
            {page > 1 && (
              <Link
                href={buildHref({ type: sp.type, q, mine: isMine, page: page - 1 })}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <Link
              href={buildHref({ type: sp.type, q, mine: isMine, page: page + 1 })}
              className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Next
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
