import { defineConfig, devices } from '@playwright/test';

// Locally, point CHROME_PATH at a system Chrome (e.g. /usr/bin/google-chrome)
// to skip `playwright install`. In CI the bundled Chromium is used.
const executablePath = process.env.CHROME_PATH || undefined;
const PORT = 4173;

// Headless WebGL runs on SwiftShader (CPU). The app detects navigator.webdriver
// and switches to its lite render path (DPR 1, no post-processing, standard
// materials, small textures); a modest viewport keeps fill cost down too.
const launchOptions = {
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: './e2e',
  // CI runners draw WebGL on the CPU at a few fps, so sheet slides alone take seconds per test.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: 10_000 },
  // CI: lets --shard split by test rather than by file; still one worker per runner.
  fullyParallel: !!process.env.CI,
  // One worker: two CPU-rendered WebGL pages fighting over a small CI runner is what made runs flaky.
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 600 }, launchOptions },
    },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
