import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Guard upload page only — check path before touching Supabase
  if (request.nextUrl.pathname !== '/artifacts/upload') {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const signInUrl = new URL('/api/auth/signin', request.url)
    signInUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }

  return response
}

// Broad matcher so Turbopack can't ignore it; path check above is the real guard
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
