const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.cjs', workers: 2, timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:8765', viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    trace: 'retain-on-failure',
  },
  webServer: { command: 'python3 scripts/serve.py --port 8765', url: 'http://127.0.0.1:8765', reuseExistingServer: !process.env.CI },
});
