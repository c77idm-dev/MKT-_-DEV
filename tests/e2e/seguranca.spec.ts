import { expect, test } from '@playwright/test';
import { MENSAGEM_LIMITE_IP } from '../../src/modules/auth/limite-login';
import { codigoUnico, entrar, entrarComo } from './apoio';
import { vigiarCsp } from './apoio-acabamento';
import { USUARIOS_E2E } from './dados';

test('cabeçalhos de segurança e sem X-Powered-By (decisão 15)', async ({ request }) => {
  const h = (await request.get('/login')).headers();
  expect(h['x-powered-by']).toBeUndefined();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=(self)');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
});

test('as telas principais abrem sem violar a CSP', async ({ page }) => {
  const violacoes = await vigiarCsp(page);
  await entrarComo(page, USUARIOS_E2E.gestor);
  for (const rota of ['/fluxo', '/fluxo/alertas', '/fluxo/devolucoes/nova', '/lotes', '/cadastros', '/contestacoes', '/configuracoes', '/configuracoes/falhas', '/configuracoes/fiscal']) {
    await page.goto(rota, { waitUntil: 'networkidle' });
  }
  expect(violacoes).toEqual([]);
});

test('limite de login por IP: 20 falhas bloqueiam o IP; outro IP entra (decisão 14)', async ({ page }) => {
  test.setTimeout(180_000);
  // O IP vem do X-Forwarded-For (no e2e não há nginx). Um valor único por execução: o servidor é o mesmo nos dois projetos.
  const ip = `ip-e2e-${codigoUnico('A')}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  const email = `${codigoUnico('ninguem').toLowerCase()}@teste.local`;
  for (let i = 0; i < 20; i++) {
    await entrar(page, { email, senha: 'senha-errada-000' }); // abre /login de novo a cada vez: o alerta é sempre o da tentativa nova
    await expect(page.getByRole('alert').filter({ hasText: 'E-mail' })).toHaveText('E-mail ou senha incorretos.');
  }
  await entrar(page, USUARIOS_E2E.operador);
  await expect(page.getByRole('alert').filter({ hasText: 'Muitas tentativas' })).toHaveText(MENSAGEM_LIMITE_IP);
  await expect(page).toHaveURL(/\/login/);

  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `${ip}-outro` });
  await entrarComo(page, USUARIOS_E2E.operador);
});
