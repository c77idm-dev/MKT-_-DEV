import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { AMBIENTE_E2E, PORTA_E2E as PORTA, URL_E2E } from './tests/e2e/dados';

if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Por padrão o e2e roda contra um build de produção (`next start`), sem a compilação lenta sob demanda do `next dev`
 * que deixava os testes instáveis. O build vai para `.next-e2e` e não atrapalha o `.next` do dev.
 * `E2E_DEV=1 npm run test:e2e` usa o `next dev` (iteração local rápida; a 1ª visita de cada rota é lenta).
 */
const MODO_DEV = process.env.E2E_DEV === '1';

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
    // `npm run build` roda o prebuild (cópia do .wasm do zxing); `npm run dev` roda o predev.
    command: MODO_DEV ? `npm run dev -- --port ${PORTA}` : `npm run build && npm run start -- --port ${PORTA}`,
    url: `${URL_E2E}/api/saude`,
    reuseExistingServer: false,
    timeout: MODO_DEV ? 120_000 : 300_000,
    // O Next não sobrescreve variáveis já definidas: o servidor de teste usa o banco de testes, o disco do e2e e os falsos.
    // AMBIENTE_E2E traz PERMITIR_FALSOS=1: só com ele o build de produção do e2e aceita os falsos (contrato §10, E1).
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      ...AMBIENTE_E2E,
      ...(MODO_DEV ? {} : { NEXT_DIST_DIR: '.next-e2e' }),
    },
  },
});
