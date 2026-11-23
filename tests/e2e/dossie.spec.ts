import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { conferirDevolucao, prepararConferencia } from './apoio-conferencia';
import { URL_E2E, USUARIOS_E2E } from './dados';

const ROTULO = 'Baixar dossiê de provas (PDF)';

test('dossiê de provas (extra): o botão só aparece depois da conferência e baixa um PDF', async ({ page }) => {
  test.setTimeout(180_000);
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const secao = page.getByRole('region', { name: 'Conferência' });
  await expect(secao).toContainText('Aguardando conferência.');
  await expect(page.getByRole('link', { name: ROTULO })).toHaveCount(0);
  // Antes da conferência a rota também recusa (409), mesmo chamada direto.
  const antes = await page.request.get(`/api/devolucoes/${d.codigo}/dossie`);
  expect(antes.status()).toBe(409);
  expect(await antes.text()).toContain('ainda não foi concluída');

  await conferirDevolucao(page, d.codigo, ['BOM']);
  const botao = secao.getByRole('link', { name: ROTULO });
  await expect(botao).toBeVisible();
  await expect(secao.getByText('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.')).toBeVisible();
  expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);

  // O aviso aparece logo no toque, enquanto o servidor ainda monta o PDF (não depende de quanto a geração demora).
  const baixando = page.waitForEvent('download');
  await botao.click();
  await expect(secao.getByRole('status').filter({ hasText: 'Gerando o PDF' })).toBeVisible();
  const download = await baixando;
  // Sem o atributo download no link: o nome vem do Content-Disposition da rota.
  expect(download.suggestedFilename()).toBe(`dossie-${d.codigo}.pdf`);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // O PDF chegou com o cookie da marca do toque: o "Gerando…" some e o botão libera (sem esperar um tempo fixo).
  await expect(secao.getByText('Gerando o PDF')).toHaveCount(0);
  await expect(botao).not.toHaveAttribute('aria-disabled', 'true');

  // O histórico registra quem gerou o dossiê.
  await page.reload();
  const historico = page.getByRole('region', { name: 'Histórico' });
  await expect(historico.getByText('Dossiê de provas (PDF) gerado')).toBeVisible();
  await expect(historico).toContainText(USUARIOS_E2E.operador.nome);

  // Sessão vencida numa aba antiga: o toque leva à tela de login, sem salvar o HTML dela como .pdf.
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.context().clearCookies();
  await page.getByRole('region', { name: 'Conferência' }).getByRole('link', { name: ROTULO }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  expect(downloads).toEqual([]);
});

test('dossiê sem sessão: a rota manda para o login', async ({ playwright }, testInfo) => {
  test.skip(ehCelular(testInfo), 'é a mesma rota nos dois projetos; basta o computador');
  const anonimo = await playwright.request.newContext({ baseURL: URL_E2E });
  try {
    const r = await anonimo.get('/api/devolucoes/DEV-000001/dossie', { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers()['location']).toMatch(/\/login$/);
  } finally {
    await anonimo.dispose();
  }
});
