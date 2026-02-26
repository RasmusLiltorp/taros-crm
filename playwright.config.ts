import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
    env: {
      NEXT_PUBLIC_POCKETBASE_URL: "http://localhost:8091",
      PB_ADMIN_EMAIL: "admin@test.local",
      PB_ADMIN_PASSWORD: "testpassword123",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      // Intentionally omit NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET
      // so Turnstile is disabled during E2E tests (Playwright cannot interact
      // with Cloudflare's iframe)
    },
  },
});
