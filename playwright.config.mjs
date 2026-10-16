// e2e: 빌드한 정적 사이트를 astro preview(:4330)로 띄워 검증한다. 계획: docs/renewal/test-plan.md
import { defineConfig, devices } from '@playwright/test';

const PORT = 4330;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: `npm run build && npx astro preview --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
