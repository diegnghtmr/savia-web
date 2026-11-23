import { defineConfig } from "@playwright/test";

const app = "http://127.0.0.1:3000";
const services = "http://127.0.0.1:4010";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".next/e2e-results",
  use: {
    baseURL: app,
    browserName: "chromium",
    serviceWorkers: "block",
    launchOptions: { args: ["--no-proxy-server"] },
  },
  webServer: [
    {
      command: "node e2e/fixtures/services.mjs",
      url: `${services}/ready`,
      reuseExistingServer: false,
    },
    {
      command: "pnpm start --hostname 127.0.0.1",
      url: `${app}/sign-in`,
      reuseExistingServer: false,
      env: {
        BACKEND_BASE_URL: services,
        SUPABASE_URL: services,
        SUPABASE_ANON_KEY: "offline-fixture-key",
        NEXT_TELEMETRY_DISABLED: "1",
        NO_PROXY: "127.0.0.1,localhost",
      },
    },
  ],
});
