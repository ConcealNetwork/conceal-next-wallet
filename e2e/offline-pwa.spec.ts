import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { expect, test } from "@playwright/test";

// Verifies the offline app shell against the REAL static export (out/). Skips
// when out/ is absent (e.g. CI's Playwright job, which runs `next dev` and does
// not build the export) — run `NEXT_PUBLIC_USE_MOCK=false PAGES_BASE_PATH=/conceal-next-wallet
// npm run build` first to exercise it locally.
const OUT = join(process.cwd(), "out");
const BASE = "/conceal-next-wallet";
const hasExport = existsSync(join(OUT, "precache-manifest.json"));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

test.describe("offline app shell", () => {
  test.skip(!hasExport, "no static export (out/) — build it first to run this test");

  let server: Server;
  let port = 0;

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
        if (pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length) || "/";
        if (pathname.endsWith("/")) pathname += "index.html";
        // Contain to OUT (no traversal).
        const filePath = normalize(join(OUT, pathname));
        if (filePath !== OUT && !filePath.startsWith(OUT + sep)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        const body = await readFile(filePath);
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
        // Let the SW control caching; don't let the browser HTTP-cache mask it.
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });
    // Sanity: the export must include the SW + manifest.
    await stat(join(OUT, "service-worker.js"));
  });

  test.afterAll(() => server?.close());

  test("opens the wallet from cache while offline", async ({ page }) => {
    const base = `http://127.0.0.1:${port}${BASE}/`;
    await page.goto(base);
    await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();

    // Wait for the service worker to control the page (install + precache done).
    await page.waitForFunction(
      async () => {
        if (!("serviceWorker" in navigator)) return false;
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller != null;
      },
      undefined,
      { timeout: 20_000 },
    );

    // Cut the network; the shell must still come from the SW cache.
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();

    // A deep route must also resolve offline (per-route index.html fallback).
    await page.goto(`http://127.0.0.1:${port}${BASE}/wallet/receive/`);
    await expect(page).toHaveTitle(/Conceal Wallet/i);

    await page.context().setOffline(false);
  });
});
