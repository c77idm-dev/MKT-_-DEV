import { expect, test } from '@playwright/test';
import { abrirReceberPacote, entrarComo } from './apoio';
import { vigiarCsp } from './apoio-acabamento';
import { conferirDevolucao, prepararConferencia } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('o leitor do Recebimento e uma conferência inteira (fotos, vídeo, ZXing) não violam a CSP', async ({ page }) => {
  test.setTimeout(240_000);
  const violacoes = await vigiarCsp(page);
  const { codigo } = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  // O leitor de código pela câmera (o mesmo caminho do camera.spec.ts da Fase 2): carrega o ZXing (wasm).
  await abrirReceberPacote(page);
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByLabel('Imagem da câmera')).toBeVisible();
  await page.waitForTimeout(2000); // dá tempo de o leitor carregar o wasm e tentar ler
  await page.getByRole('button', { name: 'Fechar câmera' }).click();
  // A conferência pela tela (Fase 2, E11): Fotos 1 a 4, Vídeo de Prova, envio tus e as miniaturas.
  await conferirDevolucao(page, codigo, ['BOM']);
  expect(violacoes).toEqual([]);
});
