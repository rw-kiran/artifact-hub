// Block private/internal IP ranges to prevent SSRF in publish_artifact
export function isPrivateUrl(urlString: string): boolean {
  try {
    const { hostname, protocol } = new URL(urlString)
    if (protocol !== 'https:' && protocol !== 'http:') return true
    return (
      /^localhost$/i.test(hostname) ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^(\[::1\]|::1)$/.test(hostname) ||
      /^fc00:/i.test(hostname) ||
      /^fd[0-9a-f]{2}/i.test(hostname) ||
      /^fe80:/i.test(hostname)
    )
  } catch {
    return true
  }
}

const MAX_REDIRECTS = 5

// Drop-in fetch replacement that checks every URL in the redirect chain.
// Prevents redirect-based SSRF: a public URL redirecting to 169.254.x.x bypasses
// a hostname-only check on the initial URL.
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isPrivateUrl(current)) {
      throw new Error(`Blocked: private or non-HTTP URL at hop ${hop}: ${current}`)
    }
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Redirect with no Location header')
      current = new URL(location, current).href
      continue
    }
    return res
  }
  throw new Error('Too many redirects (max 5)')
}
