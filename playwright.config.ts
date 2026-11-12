import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

const PORTA = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORTA}`, trace: 'retain-on-failure' },
  // Mobile-first: todo spec roda no computador e no celular (390×844, Chromium).
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORTA}`,
    url: `http://localhost:${PORTA}/api/saude`,
    reuseExistingServer: false,
    timeout: 120_000,
    // O Next não sobrescreve variáveis já definidas, então o servidor de teste usa o banco de testes.
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
  },
});
