'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/db/supabase-browser'

export function Nav() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const handle = user?.user_metadata?.user_name as string | undefined

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b bg-white">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Artifact Hub
      </Link>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-gray-600 hidden sm:block">
              {handle ? `@${handle}` : user.email}
            </span>
            <Link
              href="/artifacts/upload"
              className="text-sm font-medium bg-black text-white px-3 py-1.5 rounded-md hover:bg-gray-800"
            >
              Upload
            </Link>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </>
        ) : (
          <a
            href="/api/auth/signin"
            className="text-sm font-medium bg-black text-white px-3 py-1.5 rounded-md hover:bg-gray-800"
          >
            Sign in with GitHub
          </a>
        )}
      </div>
    </nav>
  )
}
