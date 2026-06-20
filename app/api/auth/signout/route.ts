import { createAuthClient } from '@/lib/db/supabase'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  await createAuthClient(cookieStore).auth.signOut()
  return NextResponse.redirect(new URL('/', request.url))
}
