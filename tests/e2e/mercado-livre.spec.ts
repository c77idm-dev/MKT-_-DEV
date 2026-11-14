import { expect, test } from '@playwright/test';
import { idReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { alvosDeToque44, avisarML, contestacaoPronta, emModoFalso, esperarDevolucaoDaReclamacao, garantirContaFalsa, semContaML } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');

test('gestor conecta a conta do ML (falso), vê a última sincronização e desconecta', async ({ page }) => {
  await semContaML();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Nenhuma conta conectada.')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await page.getByRole('button', { name: 'Conectar conta do Mercado Livre' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Conta do Mercado Livre conectada.' })).toBeVisible();
  // No modo falso o redirecionamento da Server Action passa por /api/ml/retorno (navegação suave) e a barra de endereço
  // fica nessa URL intermediária; volta à página limpa antes de recarregar (recarregar o retorno repetiria o OAuth).
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByText('123456789', { exact: true })).toBeVisible();
  // A conexão enfileira a primeira varredura; o worker do e2e grava a última sincronização.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText('Ainda não sincronizou').count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(0);
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await page.getByRole('button', { name: 'Desconectar' }).click();
  await page.getByRole('button', { name: 'Toque de novo para desconectar' }).click();
  await expect(page).toHaveURL(/\?ok=desconectada$/);
  await expect(page.getByText('Nenhuma conta conectada.')).toBeVisible();
});

test('aviso do ML cria a devolução sozinha e o detalhe mostra a seção Mercado Livre', async ({ page, request }) => {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(1);
  await avisarML(request, reclamacaoId);
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);

  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByText('Automática (API do canal)')).toBeVisible();
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByRole('heading', { name: 'Mercado Livre' })).toBeVisible();
  await expect(secao.getByText(reclamacaoId, { exact: true })).toBeVisible();
  await expect(secao.getByText('A caminho')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});

test('o endpoint de avisos recusa JSON inválido (400) e aceita aviso de outro recurso (200)', async ({ request }) => {
  const invalido = await request.post('/api/ml/notificacoes', { data: Buffer.from('{nao json'), headers: { 'content-type': 'application/json' } });
  expect(invalido.status()).toBe(400);
  const outro = await request.post('/api/ml/notificacoes', { data: { resource: '/orders/1', topic: 'orders_v2', user_id: 1 } });
  expect(outro.status()).toBe(200);
});

test('gestor revisa a contestação e envia ao ML', async ({ page }) => {
  await garantirContaFalsa();
  const { id, codigo } = await contestacaoPronta({ cenario: 1, motivo: 'USADO' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/contestacoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Contestações ML' })).toBeVisible();
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('SRF6');
  await expect(cartao).toContainText('Prazo');
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await cartao.click();
  await expect(page).toHaveURL(new RegExp(`/contestacoes/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Contestação ${codigo}` })).toBeVisible();
  await page.getByLabel('Mensagem').fill('O produto voltou com marcas de uso. Pedimos a revisão.');
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));
  await page.getByRole('button', { name: 'Enviar ao ML' }).click();
  await page.getByRole('button', { name: 'Toque de novo para enviar ao ML' }).click();
  await expect(page.getByRole('status')).toHaveText('Envio pedido ao Mercado Livre. O resultado aparece aqui em instantes.');
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('heading', { name: 'Enviada ao ML' }).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect(page.getByText('O produto voltou com marcas de uso. Pedimos a revisão.')).toBeVisible();
  await semRolagemLateral(page);
});

test('contestação recusada pelo ML aparece com o motivo e pode ser revisada de novo', async ({ page }) => {
  await garantirContaFalsa();
  const { id } = await contestacaoPronta({ cenario: 8, motivo: 'USADO' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/contestacoes/${id}`);
  await page.getByRole('button', { name: 'Enviar ao ML' }).click();
  await page.getByRole('button', { name: 'Toque de novo para enviar ao ML' }).click();
  await expect(page).toHaveURL(/\?ok=solicitado$/);
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(/O envio falhou: O Mercado Livre recusou o envio/).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect(page.getByText('Envio pedido ao Mercado Livre')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar ao ML' })).toBeVisible();
  await semRolagemLateral(page);
  await page.goto('/contestacoes?status=FALHOU');
  await expect(page.getByRole('link', { name: /^Com falha/ })).toHaveAttribute('aria-current', 'page');
});

test('fiscal não abre Configurações › Mercado Livre nem o detalhe de uma contestação (HTTP 404)', async ({ page }) => {
  const { id } = await contestacaoPronta({ cenario: 1, motivo: 'AVARIADO' });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/configuracoes/mercado-livre');
  await paginaNaoEncontrada(page, `/contestacoes/${id}`);
});
