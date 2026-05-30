/** Public asset URL with GitHub Pages base path (e.g. /conceal-next-wallet). */
export function publicAssetPath(relativePath: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? ""
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`
  return `${base}${path}`
}
