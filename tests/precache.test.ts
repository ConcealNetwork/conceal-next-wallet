import { describe, expect, it } from "vitest";
import { buildPrecacheList, isWorkerChunk } from "@/lib/pwa/precache.mjs";

const FILES = [
  "index.html",
  "wallet/account/index.html",
  "create/index.html",
  "explorations/landing-index.html", // design mockup — excluded
  "_next/static/chunks/main-abc123.js",
  "_next/static/css/app-def456.css",
  "_next/static/media/font.woff2",
  "_next/static/chunks/main-abc123.js.map", // source map — excluded
  "_next/static/chunks/turbopack-worker-2gqdcwp7k90ea.js", // worker bootstrap — excluded (#184)
  "manifest.webmanifest",
  "icon-192.png", // manifest install icon — precached
  "icon-512.png", // manifest install icon — precached
  "icon-maskable-512.png", // maskable install icon — precached
  "og.png", // social card — precached
  "screenshot.png", // unrelated top-level PNG — excluded
  "lib/concealjs/concealjs.js", // runtime-cached — excluded
  "workers/sync-worker.js", // runtime-cached — excluded
  "404.html", // error page — served via offline fallback, not precached
  "404/index.html",
  "_not-found/index.html",
  "build-manifest.txt", // sidecar — excluded
];

describe("buildPrecacheList", () => {
  it("includes route HTML, Next static assets, and the web manifest", () => {
    const list = buildPrecacheList(FILES);
    expect(list).toContain("index.html");
    expect(list).toContain("wallet/account/index.html");
    expect(list).toContain("create/index.html");
    expect(list).toContain("_next/static/chunks/main-abc123.js");
    expect(list).toContain("_next/static/css/app-def456.css");
    expect(list).toContain("_next/static/media/font.woff2");
    expect(list).toContain("manifest.webmanifest");
  });

  it("includes the manifest icon PNGs and social card for offline install/splash", () => {
    const list = buildPrecacheList(FILES);
    expect(list).toContain("icon-192.png");
    expect(list).toContain("icon-512.png");
    expect(list).toContain("icon-maskable-512.png");
    expect(list).toContain("og.png");
  });

  it("excludes mockups, runtime-cached libs/workers, error pages, maps, sidecars, and unlisted PNGs", () => {
    const list = buildPrecacheList(FILES);
    expect(list).not.toContain("explorations/landing-index.html");
    expect(list).not.toContain("screenshot.png");
    expect(list).not.toContain("lib/concealjs/concealjs.js");
    expect(list).not.toContain("workers/sync-worker.js");
    expect(list).not.toContain("404.html");
    expect(list).not.toContain("404/index.html");
    expect(list).not.toContain("_not-found/index.html");
    expect(list).not.toContain("_next/static/chunks/main-abc123.js.map");
    expect(list).not.toContain("build-manifest.txt");
  });

  it("excludes Turbopack worker bootstrap chunks (their hash params die in a cached response)", () => {
    const list = buildPrecacheList(FILES);
    expect(list).not.toContain("_next/static/chunks/turbopack-worker-2gqdcwp7k90ea.js");
    // ...but a regular code chunk in the same dir is still precached.
    expect(list).toContain("_next/static/chunks/main-abc123.js");
  });

  it("isWorkerChunk matches only worker bootstrap chunks under _next/static/chunks", () => {
    expect(isWorkerChunk("_next/static/chunks/turbopack-worker-2gqdcwp7k90ea.js")).toBe(true);
    expect(isWorkerChunk("_next/static/chunks/scan-worker-abc.js")).toBe(true);
    expect(isWorkerChunk("_next/static/chunks/main-abc123.js")).toBe(false);
    expect(isWorkerChunk("_next/static/media/scan-worker.0c4lni7.ts")).toBe(false); // not a chunk .js
    expect(isWorkerChunk("workers/sync-worker.js")).toBe(false); // not under _next/static/chunks
  });

  it("normalizes leading ./ and / and dedupes, returning sorted root-relative URLs", () => {
    const list = buildPrecacheList(["./index.html", "/index.html", "index.html"]);
    expect(list).toEqual(["index.html"]);
    expect(list.every((u) => !u.startsWith("/") && !u.startsWith("./"))).toBe(true);
  });

  it("returns a stable (sorted) order", () => {
    expect(buildPrecacheList(["b.html", "a.html"])).toEqual(["a.html", "b.html"]);
  });
});
