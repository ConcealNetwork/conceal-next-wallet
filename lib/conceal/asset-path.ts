const isCordovaBuild = process.env.NEXT_PUBLIC_CORDOVA === "true";

/** Public asset URL with GitHub Pages base path (e.g. /conceal-next-wallet). */
export function publicAssetPath(relativePath: string): string {
  const path = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  // Cordova WebView serves www/ at https://localhost/ — resolve from origin root.
  if (isCordovaBuild) {
    if (typeof window !== "undefined") {
      const base =
        typeof document !== "undefined" && document.baseURI
          ? document.baseURI
          : `${window.location.origin}/`;
      return new URL(path, base).toString();
    }
    return `/${path}`;
  }
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? "";
  return base ? `${base}/${path}` : `/${path}`;
}
