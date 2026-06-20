// Block private/internal IP ranges to prevent SSRF in publish_artifact
export function isPrivateUrl(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString)
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
