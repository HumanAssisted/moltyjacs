import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration.test.ts"],
    alias: {
      // Mock the native JACS module so tests run without the NAPI binary
      "@hai-ai/jacs": path.resolve(__dirname, "test/__mocks__/jacs.ts"),
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
