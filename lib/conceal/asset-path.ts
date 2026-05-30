/** Public script URL prefix (GitHub Pages subpath). */
export function publicAssetPath(relativePath: string): string {
  const base = process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? ""
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`
  return `${base}${path}`
}
