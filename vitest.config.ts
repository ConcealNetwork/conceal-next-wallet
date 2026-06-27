import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    // Unit tests target the mock UI; pin mock mode so a real-mode `.env.local`
    // (used to run the dev server) can't flip the suite and pull in the SDK engine.
    env: { NEXT_PUBLIC_USE_MOCK: "true" },
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
    },
  },
});
