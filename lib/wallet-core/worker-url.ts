/** Absolute URL for sync worker scripts under public/workers/ (GitHub Pages basePath aware). */
export function walletWorkerUrl(filename: string): string {
  if (typeof window === "undefined") {
    return `./workers/${filename}`
  }
  const base = process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? ""
  const path = `/workers/${filename}`.replace(/\/+/g, "/")
  return `${window.location.origin}${base}${path}`
}
