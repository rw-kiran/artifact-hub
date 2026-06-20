import { createServerSupabaseClient } from '@/lib/db/supabase'
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

function tabHref(value: string, q: string | undefined, page: number) {
  const params = new URLSearchParams()
  if (value) params.set('type', value)
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? '1'))
  const type = sp.type as ArtifactType | undefined
  const q = sp.q

  const supabase = createServerSupabaseClient()
  const from = (page - 1) * 20

  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, from + 19)

  if (type && ['html', 'image', 'pdf'].includes(type)) query = query.eq('type', type)
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)

  const { data: artifacts } = await query

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col gap-6">
        <SearchBar defaultValue={q} />
        <div className="flex gap-2 flex-wrap">
          {TYPE_TABS.map(({ label, value }) => {
            const active = (sp.type ?? '') === value
            return (
              <Link
                key={value}
                href={tabHref(value, q, 1)}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
        {!artifacts?.length ? (
          <div className="text-center py-16 text-gray-400">
            No artifacts yet.{' '}
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
                href={tabHref(sp.type ?? '', q, page - 1)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <Link
              href={tabHref(sp.type ?? '', q, page + 1)}
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
