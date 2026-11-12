import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { PORTA_E2E as PORTA, URL_E2E } from './tests/e2e/dados';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  expect: { timeout: 15_000 },
  use: { baseURL: URL_E2E, trace: 'retain-on-failure', actionTimeout: 15_000, navigationTimeout: 30_000 },
  // Mobile-first: todo spec roda no computador e no celular (390×844, Chromium).
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORTA}`,
    url: `${URL_E2E}/api/saude`,
    reuseExistingServer: false,
    timeout: 120_000,
    // O Next não sobrescreve variáveis já definidas, então o servidor de teste usa o banco de testes.
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
  },
});
