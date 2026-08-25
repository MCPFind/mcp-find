import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      // task 12: opengraph-image satori render-tree regression test
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      // F8: smoke tests for scripts/ — runs check-broken-delta.mjs poisoning checks
      "../../scripts/__tests__/**/*.test.mjs",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "**/*.d.ts"],
    },
  },
});
