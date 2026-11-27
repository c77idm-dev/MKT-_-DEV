/**
 * (E29, extra) Bancada do Operador: a tela de quem só recebe e confere, no celular e no computador.
 */
import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { devolucoes, retiradasFull } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirMenuAcoes, abrirReceberPacote, aguardarHidratacao, codigoUnico, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

async function criarComRastreio(rastreio: string): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio })).codigo;
  });
}

async function alturaMinima(locator: import('@playwright/test').Locator, minimo = 44) {
  expect((await locator.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(minimo);
}

test('o Operador entra na Bancada, só com a aba Bancada; o quadro e a Nova devolução levam de volta a ela', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await expect(page).toHaveURL(/\/bancada$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bancada' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText(['Bancada']);
  await expect(nav.getByRole('link', { name: 'Bancada' })).toHaveAttribute('aria-current', 'page');
  const chegou = page.getByRole('button', { name: 'Chegou um pacote' });
  await expect(chegou).toBeVisible();
  await alturaMinima(chegou, 80);
  await expect(page.getByRole('region', { name: /^Esperando conferência \(\d+\)$/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Retirada do Full aberta' })).toBeVisible();
  await semRolagemLateral(page);

  for (const rota of ['/fluxo', '/fluxo/devolucoes/nova', '/fluxo/busca?rastreio=X', '/fluxo/etapa/2', '/fluxo/estoque-bom', '/importacoes/devolucoes', '/fluxo/recebimento']) {
    await page.goto(rota);
    await expect(page, `${rota} leva à Bancada`).toHaveURL(/\/bancada$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bancada' })).toBeVisible();
  }
  // O endereço raiz e o /login com sessão também.
  await page.goto('/');
  await expect(page).toHaveURL(/\/bancada$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/bancada$/);
});

test('lê um rastreio: o cartão verde com "Conferir agora", que abre a conferência travada com o Operador', async ({ page }) => {
  const rastreio = codigoUnico('BC');
  const codigo = await criarComRastreio(rastreio);
  await entrarComo(page, USUARIOS_E2E.operador);
  const fila = page.getByRole('region', { name: /^Esperando conferência \(\d+\)$/ });
  const antes = Number((await fila.getByRole('heading').textContent())?.match(/\((\d+)\)/)?.[1]);
  await abrirReceberPacote(page);
  await semRolagemLateral(page);
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const cartao = page.getByTestId('cartao-resultado');
  await expect(cartao).toContainText('Chegada registrada');
  await expect(cartao).toContainText(codigo);
  const conferir = cartao.getByRole('button', { name: 'Conferir agora' });
  const proximo = cartao.getByRole('button', { name: 'Próximo pacote' });
  await expect(conferir).toBeVisible();
  await expect(proximo).toBeVisible();
  await alturaMinima(conferir);
  await alturaMinima(proximo);
  // A fila embaixo já conta a devolução que chegou (ela entra no fim: a ordem é a da chegada).
  await expect(fila.getByRole('heading')).toHaveText(`Esperando conferência (${antes + 1})`);
  await semRolagemLateral(page);

  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await conferir.click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${codigo}/conferencia$`));
  const situacao = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const [d] = await db.select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    return { status: d.status, comOOperador: d.conferenteId === operador.id };
  });
  expect(situacao).toEqual({ status: 'EM_CONFERENCIA', comOOperador: true });

  // De volta à Bancada, a conferência dele aparece com "Continuar".
  await page.goto('/bancada');
  const continuar = page.getByRole('link', { name: `Continuar ${codigo}` });
  await expect(continuar).toHaveAttribute('href', `/fluxo/devolucoes/${codigo}/conferencia`);
});

test('"Próximo pacote" limpa a tela e volta ao campo', async ({ page }, testInfo) => {
  const rastreio = codigoUnico('BP');
  await criarComRastreio(rastreio);
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await campo.press('Enter');
  const cartao = page.getByTestId('cartao-resultado');
  await expect(cartao).toContainText('Chegada registrada');
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await cartao.getByRole('button', { name: 'Próximo pacote' }).click();
  await expect(cartao).toHaveCount(0);
  await expect(campo).toHaveValue('');
  if (testInfo.project.name === 'computador') await expect(campo).toBeFocused();
});

test('código desconhecido: "De onde veio este pacote?"; "Do armazém do ML (Full)" abre a retirada e "De cliente, sem cadastro" cria a não identificada', async ({
  page,
}) => {
  const etiqueta = codigoUnico('FULLB');
  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(etiqueta);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const pergunta = page.getByRole('region', { name: 'De onde veio este pacote?' });
  await expect(pergunta).toContainText(etiqueta);
  const full = pergunta.getByRole('button', { name: 'Do armazém do ML (Full)' });
  const cliente = pergunta.getByRole('button', { name: 'De cliente, sem cadastro' });
  await expect(full).toHaveAccessibleDescription("remetente MELI e 'Ret. ID' na etiqueta");
  await expect(cliente).toHaveAccessibleDescription('vira não identificada e o Gestor liga depois');
  // Os dois do mesmo tamanho.
  const [a, b] = [(await full.boundingBox())!, (await cliente.boundingBox())!];
  expect(Math.round(a.width)).toBe(Math.round(b.width));
  expect(Math.round(a.height)).toBe(Math.round(b.height));
  expect(a.height).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await full.click();
  await expect(page).toHaveURL(/\/fluxo\/retiradas-full\/RF-\d{6,}$/);
  const rf = page.url().split('/').pop()!;
  const salva = await comBanco(async (db) => {
    const [r] = await db.select({ etiqueta: retiradasFull.codigoEtiqueta, situacao: retiradasFull.situacao }).from(retiradasFull).where(eq(retiradasFull.codigo, rf));
    const comoDevolucao = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.rastreio, etiqueta));
    return { ...r, devolucoes: comoDevolucao.length };
  });
  expect(salva).toEqual({ etiqueta, situacao: 'ABERTA', devolucoes: 0 });
  // A volta é para a Bancada, onde a retirada aberta aparece com "Continuar".
  await page.getByRole('link', { name: '← Bancada' }).click();
  await expect(page).toHaveURL(/\/bancada$/);
  await expect(page.getByRole('region', { name: 'Retirada do Full aberta' }).getByRole('link', { name: `Continuar ${rf}` })).toBeVisible();

  // Outro pacote, de cliente: vira não identificada.
  const desconhecido = codigoUnico('NIB');
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(desconhecido);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(pergunta).toContainText(desconhecido);
  await page.waitForTimeout(800);
  await pergunta.getByRole('button', { name: 'De cliente, sem cadastro' }).click();
  const cartao = page.getByTestId('cartao-resultado');
  await expect(cartao).toContainText('Pacote não identificado registrado');
  await expect(cartao.getByRole('button', { name: /^Conferir/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fotos do pacote' })).toBeVisible();
  const criada = await comBanco(async (db) =>
    db.select({ naoIdentificada: devolucoes.naoIdentificada, status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.rastreio, desconhecido)),
  );
  expect(criada).toEqual([{ naoIdentificada: true, status: 'AGUARDANDO_CONFERENCIA' }]);
  await semRolagemLateral(page);
});

test('Gestor: o menu "Receber pacote" abre a Bancada, com a volta ao Fluxo', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link', { name: 'Bancada' })).toHaveCount(0);
  const menu = await abrirMenuAcoes(page);
  await menu.getByRole('link', { name: 'Receber pacote' }).click();
  await expect(page).toHaveURL(/\/bancada$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bancada' })).toBeVisible();
  const chegou = page.getByRole('button', { name: 'Chegou um pacote' });
  await aguardarHidratacao(chegou);
  await expect(page.getByRole('link', { name: '← Fluxo' })).toHaveAttribute('href', '/fluxo');
  await semRolagemLateral(page);
});

test('o Fiscal não abre a Bancada (HTTP 404)', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/bancada');
  await expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible();
});
