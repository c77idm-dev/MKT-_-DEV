import { expect, test } from '@playwright/test';
import { codigoUnico, entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('operador importa devoluções por planilha: uma por pedido, uma linha por unidade', async ({ page }) => {
  // Códigos únicos por execução: o banco é o mesmo para o computador e o celular.
  const [p1, p2, r1, r2, r3] = [codigoUnico('SHP'), codigoUnico('AMZ'), codigoUnico('IM'), codigoUnico('IM'), codigoUnico('IM')];
  const csv = [
    'Marketplace;Pedido;Reclamação;Rastreio;Transportadora;SKU;Qtd;Motivo;Data de postagem',
    `Shopee;${p1};;${r1};Correios;FONE-01;1;Defeito;05/11/2026`,
    `Shopee;${p1};;${r1};Correios;CABO-02;2;Defeito;05/11/2026`,
    `Amazon;${p2};;${r2};Correios;FONE-01;1;Arrependimento;06/11/2026`,
    `Magalu;;;${r3};Correios;FONE-01;1;;`,
  ].join('\r\n');

  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/1');
  await page.getByRole('link', { name: 'Importar planilha' }).click();
  await page.getByLabel('Planilha').setInputFiles({ name: 'devolucoes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();

  await expect(page.getByLabel('Número do pedido (obrigatório)')).toHaveValue('Pedido');
  await expect(page.getByText(/3 linhas prontas/)).toBeVisible();
  await expect(page.getByText('Informe o número do pedido')).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Devoluções criadas: 2');
  await expect(page.getByRole('status')).toContainText('Linhas com erro (ignoradas): 1 (linha 5)');

  await page.goto(`/fluxo/busca?rastreio=${r1}`);
  await page.getByRole('link', { name: /DEV-\d{6}/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Itens (3 unidades)' })).toBeVisible();
  await expect(page.getByText('Planilha', { exact: true })).toBeVisible();
});
