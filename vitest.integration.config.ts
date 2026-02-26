import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 30000,
    env: {
      NEXT_PUBLIC_POCKETBASE_URL: "http://localhost:8091",
      PB_ADMIN_EMAIL: "admin@test.local",
      PB_ADMIN_PASSWORD: "testpassword123",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
