import { defineConfig, devices } from "@playwright/test";

// Port is overridable (E2E_PORT) so the suite can run alongside a dev server on
// the default 3100. CI uses the default.
const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Retry on CI: the dev server compiles routes lazily on first navigation (Turbopack),
  // so the first hit of a heavy route can exceed an assertion timeout on a cold runner —
  // an intermittent flake unrelated to the code under test. The retry re-runs the spec
  // with that route already warm, so it passes deterministically (it does NOT mask a real
  // failure — a genuine regression fails every attempt). Pairs with `trace: on-first-retry`.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `NEXT_PUBLIC_USE_MOCK=true npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
