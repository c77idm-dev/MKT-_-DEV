import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import {
  aguardarHidratacao,
  codigoUnico,
  comBanco,
  ehCelular,
  entrarComo,
  paginaNaoEncontrada,
  semRolagemLateral,
  usuarioPorEmail,
} from './apoio';
import { USUARIOS_E2E } from './dados';

async function criarComRastreio(rastreio: string, status?: 'CANCELADA'): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const criada = await criarDevolucaoTeste(db, operador, { rastreio });
    if (status) await db.update(devolucoes).set({ status }).where(eq(devolucoes.codigo, criada.codigo));
    return criada.codigo;
  });
}

test('operador registra a chegada digitando o rastreio (como faz o leitor USB)', async ({ page }, testInfo) => {
  const rastreio = codigoUnico('RC');
  const codigo = await criarComRastreio(rastreio);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: 'Recebimento' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Recebimento' })).toBeVisible();
  const abrirCamera = page.getByRole('button', { name: 'Ler com a câmera' });
  await expect(abrirCamera).toBeVisible();
  expect((await abrirCamera.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);

  const campo = page.getByLabel('Código de Rastreamento');
  const resultado = page.getByRole('status');
  await campo.fill(rastreio.toLowerCase());
  await campo.press('Enter');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(codigo);
  await expect(resultado).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await expect(campo).toHaveValue('');
  if (!ehCelular(testInfo)) await expect(campo).toBeFocused(); // computador: pronto para o próximo pacote
  await semRolagemLateral(page);

  await campo.fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(resultado).toContainText('Este pacote já chegou');
  await expect(resultado).toContainText(`${codigo} já tinha chegado`);
  await semRolagemLateral(page);

  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: new RegExp(codigo) }).click();
  await expect(page.getByText('Chegada registrada')).toBeVisible();
});

test('pacote de devolução cancelada mostra o cartão de bloqueada, com texto e ícone', async ({ page }) => {
  const rastreio = codigoUnico('BL');
  const codigo = await criarComRastreio(rastreio, 'CANCELADA');
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Fale com o Gestor');
  await expect(resultado).toContainText(codigo);
  await expect(page.getByTestId('cartao-resultado').locator('svg[aria-hidden="true"]').first()).toBeVisible();
  await semRolagemLateral(page);
});

test('rastreio desconhecido vira pacote não identificado', async ({ page }) => {
  const rastreio = codigoUnico('NI');
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(page.getByRole('status')).toContainText(`Nenhuma devolução com o rastreio ${rastreio}`);
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Registrar pacote não identificado' }).click();
  await expect(page.getByRole('status')).toContainText('Pacote não identificado registrado');
  await page.getByTestId('cartao-resultado').getByRole('link').click();
  await expect(page.getByText('Não identificada').first()).toBeVisible();
});

test('em aparelho de toque o campo não rouba o foco (o teclado não cobre a câmera)', async ({ page }, testInfo) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  const campo = page.getByLabel('Código de Rastreamento');
  await expect(campo).toBeVisible();
  const celular = ehCelular(testInfo);
  if (celular) {
    await aguardarHidratacao(campo);
    await expect(campo).not.toBeFocused();
  }
  else await expect(campo).toBeFocused();
});

test('o Fiscal não abre o Recebimento (HTTP 404)', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/fluxo/recebimento');
});
