import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/integration.test.ts"],
    alias: {
      // Use the REAL @hai.ai/jacs native module from the local JACS repo
      "@hai.ai/jacs": path.resolve(__dirname, "../JACS/jacsnpm"),
    },
    testTimeout: 15000,
  },
});
