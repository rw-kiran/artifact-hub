// Regenerates the 5 HTML artifacts with self-contained AI-generated pages
// Run: node scripts/regen-html-artifacts.mjs
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { put } from '@vercel/blob'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.prod.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.match(/^([^=]+)=(.*)$/)?.slice(1) ?? [])
    .filter(([k]) => k)
    .map(([k, v]) => [k.trim(), v.replace(/^["']|["']$/g, '').trim()])
)

process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const ARTIFACTS = [
  {
    id: '9b46abf8-c95e-43cf-8941-28980422cfb2',
    pathname: 'Income_statement',
    prompt: `Generate a complete, self-contained HTML page about "Income Statement Fundamentals" for finance professionals.
Cover: revenue recognition, COGS, gross margin, operating expenses, EBITDA, depreciation & amortization, EBIT, interest expense, EBT, net income. Include a sample income statement table with realistic numbers for a mid-size tech company.
Requirements:
- ALL CSS must be inline in a <style> tag in <head>. Zero external stylesheets or fonts.
- No external JS. No CDN links. Fully self-contained.
- Professional dark-header design, clean typography, good use of tables with alternating row colors.
- Sections: Overview, Line-by-Line Breakdown (with the sample table), Key Ratios, Common Pitfalls.
- Mobile-friendly, readable at 600px width.
Output ONLY the complete HTML document, nothing else.`,
  },
  {
    id: '91078e20-d1dd-4243-8a41-4779dc28f226',
    pathname: 'Revenue_recognition',
    prompt: `Generate a complete, self-contained HTML page about "Revenue Recognition: ASC 606 & IFRS 15" for finance professionals.
Cover: the 5-step model (identify contract, identify obligations, determine price, allocate price, recognize revenue), variable consideration, contract modifications, SaaS examples, multi-deliverable arrangements.
Requirements:
- ALL CSS must be inline in a <style> tag in <head>. Zero external stylesheets or fonts.
- No external JS. No CDN links. Fully self-contained.
- Professional design with a clear 5-step visual using numbered sections with colored backgrounds.
- Sections: Overview, The 5-Step Model (each step as a card), SaaS Application Example, Common Challenges.
- Mobile-friendly, readable at 600px width.
Output ONLY the complete HTML document, nothing else.`,
  },
  {
    id: 'ad9edd81-3c63-442a-87db-da2423c7d529',
    pathname: 'Discounted_cash_flow',
    prompt: `Generate a complete, self-contained HTML page about "Discounted Cash Flow (DCF) Valuation" for finance professionals.
Cover: free cash flow projection, WACC (with formula), terminal value (Gordon Growth Model and exit multiple method), sensitivity tables (WACC vs growth rate), common assumptions and pitfalls.
Requirements:
- ALL CSS must be inline in a <style> tag in <head>. Zero external stylesheets or fonts.
- No external JS. No CDN links. Fully self-contained.
- Professional design. Include a sensitivity table showing enterprise value at different WACC/growth combinations.
- Sections: What is DCF, FCF Projection, WACC, Terminal Value, Sensitivity Analysis, Limitations.
- Mobile-friendly, readable at 600px width.
Output ONLY the complete HTML document, nothing else.`,
  },
  {
    id: '957259e1-70ab-4053-bcd0-044657e9c8eb',
    pathname: 'Balance_sheet',
    prompt: `Generate a complete, self-contained HTML page about "Balance Sheet Analysis" for finance professionals.
Cover: the accounting equation (Assets = Liabilities + Equity), current vs non-current assets, short-term vs long-term liabilities, stockholders' equity components, key ratios (current ratio, quick ratio, debt-to-equity, working capital). Include a sample balance sheet table.
Requirements:
- ALL CSS must be inline in a <style> tag in <head>. Zero external stylesheets or fonts.
- No external JS. No CDN links. Fully self-contained.
- Professional design with a two-column layout for the balance sheet (assets left, liabilities+equity right).
- Sections: The Accounting Equation, Assets Deep Dive, Liabilities, Equity, Key Ratios, Red Flags.
- Mobile-friendly, readable at 600px width.
Output ONLY the complete HTML document, nothing else.`,
  },
  {
    id: '9a757b57-acd7-46e8-9f00-5d4ee6fbb5a5',
    pathname: 'Cash_flow_statement',
    prompt: `Generate a complete, self-contained HTML page about "Cash Flow Statement: Operating, Investing & Financing" for finance professionals.
Cover: direct vs indirect method for operating activities, capex and M&A in investing, debt issuance/repayment and dividends in financing, free cash flow formula, the working capital trap (why profitable companies go cash-negative), quality of earnings signals from cash flow.
Requirements:
- ALL CSS must be inline in a <style> tag in <head>. Zero external stylesheets or fonts.
- No external JS. No CDN links. Fully self-contained.
- Professional design with color-coded sections for each of the 3 activities (operating=blue, investing=amber, financing=green).
- Sections: Overview, Operating Activities, Investing Activities, Financing Activities, Free Cash Flow, Working Capital Trap.
- Mobile-friendly, readable at 600px width.
Output ONLY the complete HTML document, nothing else.`,
  },
]

for (const artifact of ARTIFACTS) {
  console.log(`Generating: ${artifact.pathname}...`)

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    messages: [{ role: 'user', content: artifact.prompt }],
  })

  let html = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  // Strip markdown code fences if present
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  console.log(`  Generated ${html.length} chars. Uploading...`)

  const blob = await put(artifact.pathname, html, {
    access: 'public',
    contentType: 'text/html',
    addRandomSuffix: true,
  })

  console.log(`  Uploaded: ${blob.url}`)

  const { error } = await supabase
    .from('artifacts')
    .update({ blob_url: blob.url, blob_pathname: blob.pathname, index_status: 'pending' })
    .eq('id', artifact.id)

  if (error) {
    console.error(`  DB update failed: ${error.message}`)
  } else {
    console.log(`  ✓ DB updated\n`)
  }
}

console.log('Done. Run scripts/ingest-all.mjs to re-index the updated artifacts.')
