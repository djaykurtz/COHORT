const { defineConfig } = require('@playwright/test');
const path = require('node:path');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'portfolio-showcase.spec.js',
  timeout: 30000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8497',
    viewport: { width: 1600, height: 1000 },
    headless: true,
    launchOptions: process.env.SHOWCASE_BROWSER_PATH
      ? { executablePath: process.env.SHOWCASE_BROWSER_PATH } : {},
  },
  webServer: {
    command: 'python -m http.server 8497 --bind 127.0.0.1 --directory "' + path.resolve(__dirname, '..', '..', '..', 'docs') + '"',
    url: 'http://127.0.0.1:8497',
    reuseExistingServer: false,
  },
});
