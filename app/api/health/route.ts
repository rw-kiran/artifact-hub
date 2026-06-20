export async function GET() {
  return Response.json({ ok: true, env: {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    appUrl: !!process.env.NEXT_PUBLIC_APP_URL,
  }})
}
