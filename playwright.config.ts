import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './backend/test-ui', workers: 1, timeout: 45_000,
  reporter: 'list', use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
});
