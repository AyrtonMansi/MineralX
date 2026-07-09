import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_CHROMIUM_PATH lets CI/sandbox environments point at a
// pre-installed browser (e.g. this project's own dev container ships one
// at /opt/pw-browsers) instead of downloading one at install time.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false, // tests share one dev server; keep them sequential
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/mineralx',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // NEXT_PUBLIC_MX_DEBUG exposes window.__mxDebugMap/__mxMapLoaded for
    // this test run only — never set in a real deploy (see
    // MineralXWorkspace.jsx's map-bootstrap effect).
    env: { ...process.env, NEXT_PUBLIC_MX_DEBUG: '1' },
  },
});
