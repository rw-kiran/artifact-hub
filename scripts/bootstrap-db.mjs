#!/usr/bin/env node
// Bootstrap a new Supabase project with all migrations.
// Usage: node scripts/bootstrap-db.mjs <supabase-db-url>
//
// The DB URL is on the Supabase dashboard:
//   Project → Settings → Database → Connection string → URI
//   Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
//
// Requires: npm install --save-dev pg
// Or run directly: npx -y pg ... (not supported — just npm install pg in devDeps)

import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import pg from 'pg'

const dbUrl = process.argv[2]
if (!dbUrl) {
  console.error('Usage: node scripts/bootstrap-db.mjs <supabase-db-url>')
  process.exit(1)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

console.log(`Applying ${files.length} migrations to ${new URL(dbUrl).hostname}...\n`)

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  try {
    await client.query(sql)
    console.log(`  ✓ ${file}`)
  } catch (e) {
    console.error(`  ✗ ${file}: ${e.message}`)
    // Continue — some migrations may already exist (idempotency)
  }
}

await client.end()
console.log('\nDone. Enable Email auth in Supabase → Authentication → Providers → Email.')
