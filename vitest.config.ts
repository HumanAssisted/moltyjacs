import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@hai\.ai\/jacs\/simple$/,
        replacement: path.resolve(__dirname, "test/__mocks__/jacs.ts"),
      },
      {
        find: /^@hai\.ai\/jacs\/client$/,
        replacement: path.resolve(__dirname, "test/__mocks__/jacs.ts"),
      },
      {
        find: /^@hai\.ai\/jacs\/a2a$/,
        replacement: path.resolve(__dirname, "test/__mocks__/jacs.ts"),
      },
      {
        find: /^@hai\.ai\/jacs$/,
        replacement: path.resolve(__dirname, "test/__mocks__/jacs.ts"),
      },
      {
        find: /^haiai$/,
        replacement: path.resolve(__dirname, "test/__mocks__/haiai.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
