// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: 'portfolio-showcase.spec.js',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8430',
    headless: true,
  },
});
