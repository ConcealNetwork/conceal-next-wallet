/**
 * Pure helpers for Cordova www/ post-processing (relative paths under file://).
 */

/** Directory depth from www root (index.html at root → 0). */
export function wwwDepth(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  const dir =
    normalized.includes("/") && !normalized.endsWith("/")
      ? normalized.slice(0, normalized.lastIndexOf("/"))
      : normalized.endsWith("/")
        ? normalized.slice(0, -1)
        : "";
  if (!dir || dir === ".") return 0;
  return dir.split("/").filter(Boolean).length;
}

/** Relative prefix from a file at `depth` to www root (`./`, `../`, `../../`, …). */
export function prefixForDepth(depth) {
  if (depth <= 0) return "./";
  return "../".repeat(depth);
}

/** Root-absolute app paths that must become relative in Cordova www/. */
export const CORDOVA_INTERNAL_ROOTS =
  "_next/|lib/|workers/|brand/|config\\.js|favicon|icon|apple-icon|manifest\\.webmanifest|og\\.png|create/|import/|wallet/|terms/|privacy/|support/|404|explorations/|_not-found/";

/**
 * Rewrite root-absolute internal URLs (`/foo`) to depth-relative (`./foo`, `../../foo`).
 * Leaves external URLs (https:, mailto:, etc.) unchanged.
 */
export function rewriteRootAbsolutePaths(content, prefix) {
  const roots = CORDOVA_INTERNAL_ROOTS;
  const attrPattern = new RegExp(
    `(\\s(?:href|src|content|action|data-precedence)=["'])\\/(${roots})`,
    "g",
  );
  const quotedPattern = new RegExp(`(["'])\\/(${roots})`, "g");
  const hlPattern = /(:HL\[["'])\/(_next\/)/g;

  let result = content.replace(attrPattern, `$1${prefix}$2`);
  result = result.replace(quotedPattern, `$1${prefix}$2`);
  result = result.replace(hlPattern, `$1${prefix}$2`);
  return result;
}

/** Build the cordova.js tag (legacy setup-web-wallet.sh step 7 format). */
export function cordovaScriptTag() {
  // Origin-absolute — Cordova WebView serves www/ at https://localhost/.
  return `<script type="text/javascript" src="/cordova.js"></script>`;
}

/**
 * Normalize Cordova start URLs like `/index.html` → `/` before Next hydrates.
 * `<content src="index.html" />` leaves `index.html` in pathname, which breaks
 * App Router static-export route matching.
 */
export function injectPathNormScript(html) {
  if (html.includes("ccx-cordova-path")) return html;
  const tag =
    '<script id="ccx-cordova-path">(function(){var p=location.pathname;if(p.endsWith("/index.html")){var n=p.slice(0,-10)||"/";history.replaceState(null,"",n+location.search+location.hash);}})();</script>';
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${html.slice(0, insertAt)}${tag}${html.slice(insertAt)}`;
  }
  return `${tag}${html}`;
}

/** Rewrite stale `./…` export paths on nested pages (legacy `./` assetPrefix builds). */
export function rewriteDotRelativePaths(content, depth) {
  if (depth <= 0) return content;
  const prefix = prefixForDepth(depth);
  const roots = CORDOVA_INTERNAL_ROOTS;
  const dotPattern = new RegExp(`\\.\\/(${roots})`, "g");
  return content.replace(dotPattern, `${prefix}$1`);
}

/**
 * Inject cordova.js before the FIRST `<script` in the document — legacy
 * setup-web-wallet.sh step 7. Must load before any app chunk (including head
 * scripts in the Next static export), not at `<body>` start.
 */
export function injectCordovaScript(html) {
  if (html.includes("cordova.js")) return html;
  const tag = cordovaScriptTag();
  const scriptMatch = html.match(/<script\b/i);
  if (scriptMatch && scriptMatch.index !== undefined) {
    return `${html.slice(0, scriptMatch.index)}${tag}${html.slice(scriptMatch.index)}`;
  }
  const headEnd = html.match(/<\/head>/i);
  if (headEnd && headEnd.index !== undefined) {
    return `${html.slice(0, headEnd.index)}${tag}${html.slice(headEnd.index)}`;
  }
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch && bodyMatch.index !== undefined) {
    const insertAt = bodyMatch.index + bodyMatch[0].length;
    return `${html.slice(0, insertAt)}${tag}${html.slice(insertAt)}`;
  }
  return `${tag}${html}`;
}

/** Extensions post-processed for Cordova path rewrites. */
export const CORDOVA_TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".webmanifest",
  ".txt",
]);
