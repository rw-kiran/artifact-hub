import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Nav } from '@/components/Nav'
import './globals.css'

export const metadata: Metadata = {
  title: { template: '%s | Artifact Hub', default: 'Artifact Hub' },
  description: 'Publish, browse, and share AI-generated content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Nav />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
