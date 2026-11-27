import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import {
  abrirReceberPacote,
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

async function criarComRastreio(rastreio: string, status?: 'CANCELADA' | 'NO_CD_MARKETPLACE'): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const criada = await criarDevolucaoTeste(db, operador, { rastreio });
    if (status) await db.update(devolucoes).set({ status }).where(eq(devolucoes.codigo, criada.codigo));
    return criada.codigo;
  });
}

/** (extra, E25) Devolução do ML com o pedido e o rastreio do Mercado Envios. */
async function criarDoML(dados: { pedido: string; rastreio: string; status?: 'NO_CD_MARKETPLACE' }): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const criada = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: dados.pedido, rastreio: dados.rastreio });
    if (dados.status) await db.update(devolucoes).set({ status: dados.status }).where(eq(devolucoes.codigo, criada.codigo));
    return criada.codigo;
  });
}

function digitos(n: number): string {
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
}
/** Pedido do ML: 16 dígitos começando por 2, único na execução. */
function pedidoML(): string {
  return `2${String(Date.now()).padStart(13, '0')}${digitos(2)}`;
}
/** Número do envio do ML: 11 dígitos, único na execução. */
function envioML(): string {
  return `${String(Date.now() % 1e9).padStart(9, '0')}${digitos(2)}`;
}

test('operador registra a chegada digitando o rastreio (como faz o leitor USB)', async ({ page }, testInfo) => {
  const rastreio = codigoUnico('RC');
  const codigo = await criarComRastreio(rastreio);
  // (E29) O Operador entra na Bancada e abre o Receber pacote pelo "Chegou um pacote".
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Bancada' })).toBeVisible();
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

  await page.getByTestId('cartao-resultado').getByRole('link', { name: codigo }).click();
  await expect(page.getByText('Chegada registrada')).toBeVisible();
});

test('pacote de devolução cancelada mostra o cartão de bloqueada, com texto e ícone', async ({ page }) => {
  const rastreio = codigoUnico('BL');
  const codigo = await criarComRastreio(rastreio, 'CANCELADA');
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Fale com o Gestor');
  await expect(resultado).toContainText(codigo);
  await expect(page.getByTestId('cartao-resultado').locator('svg[aria-hidden="true"]').first()).toBeVisible();
  await semRolagemLateral(page);
});

test('(extra, E25) pacote que voltou do armazém do ML (No CD do marketplace) vai para a etapa 2, com o aviso', async ({ page }) => {
  const rastreio = codigoUnico('CD');
  const codigo = await criarComRastreio(rastreio, 'NO_CD_MARKETPLACE');
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(`${codigo} · voltou do armazém do ML (extra)`);
  await expect(resultado).not.toContainText('Fale com o Gestor');
  await expect(page.getByTestId('cartao-resultado')).toContainText(`${codigo} · voltou do armazém do ML (extra)`);
  await semRolagemLateral(page);

  await page.getByTestId('cartao-resultado').getByRole('link', { name: codigo }).click();
  const historico = page.getByRole('region', { name: 'Histórico' });
  await expect(historico).toContainText('Chegada registrada (voltou do armazém do ML)');
  await expect(historico).toContainText('No CD do marketplace → Aguardando conferência');
  await semRolagemLateral(page);
});

test('(extra, E25 e E27) recebe pelo número do pedido do ML, mesmo sem o "2" do começo que a etiqueta corta, pelo toque em "Dar chegada"', async ({ page }) => {
  const pedido = pedidoML();
  const codigo = await criarDoML({ pedido, rastreio: `MM${envioML()}BRSP06`, status: 'NO_CD_MARKETPLACE' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(pedido.slice(1));
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  // E27: pelo pedido a chegada não é registrada sozinha; a ficha da venda espera o toque (depois da trava de 0,7 s).
  const dar = page.getByRole('region', { name: 'Confira antes de dar a chegada' }).getByRole('button', { name: `Dar chegada na ${codigo}` });
  await expect(dar).toBeEnabled();
  await page.waitForTimeout(800);
  await dar.click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(`${codigo} · voltou do armazém do ML (extra)`);
  await expect(resultado).toContainText(/achada pelo número do pedido do ML/i);
  await expect(page.getByTestId('cartao-resultado')).toContainText('Achada pelo número do pedido do ML (extra).');
  await semRolagemLateral(page);
});

test('(extra, E25) recebe pelo número do envio do ML que está dentro do rastreio do Mercado Envios', async ({ page }) => {
  const envio = envioML();
  const codigo = await criarDoML({ pedido: pedidoML(), rastreio: `MM${envio}BRSP02` });
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(envio);
  await campo.press('Enter');
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(codigo);
  await expect(resultado).toContainText(/achada pelo número do envio do ML/i);
  await expect(resultado).not.toContainText('armazém');
  await semRolagemLateral(page);

  // A segunda leitura do mesmo número avisa que já chegou e diz por onde achou.
  await campo.fill(envio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(resultado).toContainText('Este pacote já chegou');
  await expect(resultado).toContainText(/achada pelo número do envio do ML/i);
  await semRolagemLateral(page);
});

test('rastreio desconhecido: "De onde veio este pacote?" e "De cliente, sem cadastro" registra o pacote não identificado (E29)', async ({ page }) => {
  const rastreio = codigoUnico('NI');
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(page.getByRole('status')).toContainText(`De onde veio este pacote? Nenhuma devolução com o código ${rastreio}.`);
  await semRolagemLateral(page);
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await page.getByRole('button', { name: 'De cliente, sem cadastro' }).click();
  await expect(page.getByRole('status')).toContainText('Pacote não identificado registrado');
  await page.getByTestId('cartao-resultado').getByRole('link').click();
  await expect(page.getByText('Não identificada').first()).toBeVisible();
});

test('em aparelho de toque o campo não rouba o foco (o teclado não cobre a câmera)', async ({ page }, testInfo) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  const campo = page.getByLabel('Código de Rastreamento');
  await expect(campo).toBeVisible();
  const celular = ehCelular(testInfo);
  if (celular) {
    await aguardarHidratacao(campo);
    await expect(campo).not.toBeFocused();
  }
  else await expect(campo).toBeFocused();
});

test('o Fiscal não abre o Recebimento, que mora na Bancada (HTTP 404)', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/fluxo/recebimento');
});
