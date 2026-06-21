import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Rate limiter ────────────────────────────────────────────────────────────
// ponytail: in-memory, per Edge-function instance. Works under normal load;
// upgrade to @upstash/ratelimit (+ Upstash Redis) when multi-instance bursting
// becomes a real concern.
const RATE_WINDOWS = new Map<string, { count: number; resetAt: number }>()
const LIMIT = 20          // requests per window per IP per route
const WINDOW_MS = 60_000  // 1 minute

function checkRateLimit(ip: string, pathname: string): boolean {
  const key = `${ip}:${pathname}`
  const now = Date.now()
  const entry = RATE_WINDOWS.get(key)
  if (!entry || now > entry.resetAt) {
    RATE_WINDOWS.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= LIMIT) return false
  entry.count++
  return true
}

const AI_ROUTES = new Set(['/api/search', '/api/upload', '/api/feedback'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate-limit AI-backed routes first (cheap, no Supabase call needed)
  if (AI_ROUTES.has(pathname)) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    if (!checkRateLimit(ip, pathname)) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' },
      })
    }
    return NextResponse.next({ request })
  }

  // Auth guard for upload page
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
    signInUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return response
}

// Explicit matcher — only the routes this middleware actually guards
export const config = {
  matcher: ['/artifacts/upload', '/api/search', '/api/upload', '/api/feedback'],
}
