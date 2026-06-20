import { createAuthClient } from '@/lib/db/supabase'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/'
  const cookieStore = await cookies()
  const supabase = createAuthClient(cookieStore)

  const { data } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (data.url) return NextResponse.redirect(data.url)
  return NextResponse.redirect(new URL('/?error=auth_error', request.url))
}
