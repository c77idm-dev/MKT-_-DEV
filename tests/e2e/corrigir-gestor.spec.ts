import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes, itensDevolucao, lotes, notasFiscais, retiradasFull } from '../../src/db/schema';
import { criarDevolucaoChegada } from '../helpers/fabricas-conferencia';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../helpers/fabricas-lotes';
import { criarRetiradaTeste } from '../helpers/fabricas-retiradas';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirMenuAcoes, aguardarHidratacao, codigoUnico, comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/**
 * Emenda E29, parte 2 (frente B): "Corrigir (Gestor) (extra)" no detalhe da devolução e da Retirada do Full, e a lista
 * Apagadas. Roda no computador e no celular (390×844); cada teste cria os próprios dados (o banco é o mesmo nos dois).
 */

const NOME_BLOCO = 'Corrigir (Gestor) (extra)';
/** E24: o "Sim" só vale depois de a pergunta ficar 0,7 s na tela (useTravaToqueDuplo). */
const TRAVA_MS = 700;

/** Abre o "Corrigir (Gestor) (extra)" (recolhido) depois da hidratação e devolve o bloco. */
async function abrirCorrigir(page: Page): Promise<Locator> {
  const bloco = page.locator('details', { hasText: NOME_BLOCO });
  const resumo = bloco.locator('summary');
  await expect(resumo).toBeVisible();
  expect((await resumo.boundingBox())?.height ?? 0, 'o resumo é um alvo de toque de 44 px').toBeGreaterThanOrEqual(44);
  await aguardarHidratacao(resumo);
  await resumo.click();
  await expect(bloco).toHaveAttribute('open', '');
  return bloco;
}

/** O passo de confirmação da E24: o 1º toque abre a pergunta; o "Sim", lida a pergunta, envia. */
async function confirmar(page: Page, bloco: Locator, botao: string, pergunta: RegExp, sim: string) {
  await bloco.getByRole('button', { name: botao, exact: true }).click();
  await expect(bloco.getByText(pergunta)).toBeFocused();
  await semRolagemLateral(page);
  await page.waitForTimeout(TRAVA_MS + 100);
  await bloco.getByRole('button', { name: sim }).click();
}

test('Gestor troca Bom → Problema depois da NF, e a unidade entra no lote Aberto do fornecedor', async ({ page }) => {
  const dados = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const fornecedor = await criarFornecedorCompletoTeste(db, { razaoSocial: codigoUnico('Fornecedor Troca ') });
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj, sku: codigoUnico('TROCA') });
    const dev = await criarDevolucaoComProblemasTeste(db, operador, { unidades: [{ destino: 'BOM', serial: codigoUnico('SN'), produtoId: produto.id }] });
    await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.id, dev.itens[0].id));
    await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: new Date() }).where(eq(devolucoes.id, dev.id));
    await db.insert(notasFiscais).values({
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      situacao: 'AUTORIZADA',
      autorizadaEm: new Date(),
      referenciaEmissor: randomUUID().replaceAll('-', ''),
    });
    return { codigo: dev.codigo, itemId: dev.itens[0].id, sku: produto.sku };
  });

  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${dados.codigo}`);
  const bloco = await abrirCorrigir(page);
  // Com a NF autorizada, só trocar o estoque e corrigir os dados; a seção diz por quê.
  await expect(bloco.getByText(/A NF de devolução está autorizada/)).toBeVisible();
  await expect(bloco.getByRole('button', { name: 'Apagar devolução' })).toHaveCount(0);
  const unidade = bloco.getByRole('form', { name: /Unidade 1/ });
  await expect(unidade.getByText('Agora: Estoque Bom · Disponível para venda')).toBeVisible();
  await expect(unidade.getByLabel('Novo estoque')).toHaveValue('PROBLEMA');
  await unidade.getByLabel('Motivo do Estoque Problema').selectOption('AVARIADO');
  await semRolagemLateral(page);
  await unidade.getByRole('button', { name: 'Trocar estoque' }).click();

  await expect(page.getByText('Estoque da unidade trocado.')).toBeVisible();
  const lote = await comBanco(async (db) => {
    const [i] = await db
      .select({ status: itensDevolucao.status, destino: itensDevolucao.destino, motivo: itensDevolucao.motivo, lote: lotes.codigo, loteStatus: lotes.status })
      .from(itensDevolucao)
      .leftJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
      .where(eq(itensDevolucao.id, dados.itemId));
    return i;
  });
  expect(lote).toMatchObject({ status: 'EM_LOTE', destino: 'PROBLEMA', motivo: 'AVARIADO', loteStatus: 'ABERTO' });
  // O histórico da devolução guarda a troca.
  await expect(page.getByText('Estoque do item trocado (Gestor)')).toBeVisible();

  // No lote do fornecedor, a unidade da devolução está lá.
  await page.goto(`/lotes/${lote.lote}`);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(lote.lote!) })).toBeVisible();
  await expect(page.getByText(`Unidade 1 · ${dados.codigo}`)).toBeVisible();
  await expect(page.getByText(`Motivo: Avariado`).first()).toBeVisible();
  await semRolagemLateral(page);
});

test('Gestor desfaz uma chegada: a devolução volta para Pendente de chegada e para a etapa 1', async ({ page }) => {
  const rastreio = codigoUnico('DF');
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoChegada(db, operador, { rastreio })).codigo;
  });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const bloco = await abrirCorrigir(page);
  await expect(bloco.getByRole('button', { name: 'Reabrir a conferência' })).toHaveCount(0);
  await confirmar(page, bloco, 'Desfazer a chegada', /^Tem certeza\? A .* volta para Pendente de chegada/, 'Sim, desfazer a chegada');

  await expect(page.getByText('Chegada desfeita.')).toBeVisible();
  await expect(page.getByText('Ainda não chegou')).toBeVisible();
  await expect(page.getByText('Chegada desfeita (Gestor)')).toBeVisible();
  expect(await comBanco(async (db) => (await db.select({ s: devolucoes.status }).from(devolucoes).where(eq(devolucoes.codigo, codigo)))[0]?.s)).toBe(
    'PENDENTE_CHEGADA',
  );
  await page.goto(`/fluxo/etapa/1?rastreio=${rastreio}`);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
});

test('Gestor apaga uma devolução, ela some e fica em Apagadas, e o "Restaurar" a traz de volta', async ({ page }) => {
  const rastreio = codigoUnico('AP');
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio })).codigo;
  });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const bloco = await abrirCorrigir(page);
  await confirmar(page, bloco, 'Apagar devolução', /^Tem certeza\? A .* vai para Apagadas\./, 'Sim, apagar devolução');

  await expect(page).toHaveURL(new RegExp(`/fluxo\\?apagada=${codigo}$`));
  await expect(page.getByRole('status')).toHaveText(`${codigo} apagada. Ela fica em Apagadas por 90 dias.`);
  await page.goto(`/fluxo/etapa/1?rastreio=${rastreio}`);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toHaveCount(0);

  await page.goto('/fluxo');
  const menu = await abrirMenuAcoes(page);
  const apagadas = menu.getByRole('link', { name: 'Apagadas' });
  await expect(apagadas).toHaveAccessibleDescription('Apagou algo por engano');
  await apagadas.click();
  await expect(page).toHaveURL(/\/fluxo\/apagadas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Apagadas (extra)' })).toBeVisible();
  const linha = page.getByRole('listitem').filter({ hasText: codigo });
  await expect(linha).toContainText('Estava em: Pendente de chegada');
  await expect(linha).toContainText(`por ${USUARIOS_E2E.gestor.nome}`);
  await expect(linha).toContainText('Some de vez em 90 dias');
  await semRolagemLateral(page);
  const restaurar = linha.getByRole('button', { name: `Restaurar ${codigo}` });
  expect((await restaurar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await aguardarHidratacao(restaurar);
  await restaurar.click();
  await expect(page.getByRole('status')).toHaveText(`${codigo} restaurada. Ela voltou para Pendente de chegada.`);
  await expect(page.getByRole('listitem').filter({ hasText: codigo })).toHaveCount(0);

  await page.goto(`/fluxo/etapa/1?rastreio=${rastreio}`);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
});

test('Gestor reabre uma retirada conferida, apaga e restaura pela lista Apagadas', async ({ page }) => {
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const r = await criarRetiradaTeste(db, operador, {
      itens: [{ eanLido: codigoUnico('789'), descricao: 'Fone da retirada', quantidade: 2 }],
      concluidaEm: new Date(),
      etiqueta: codigoUnico('FULL'),
    });
    return r.codigo;
  });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/retiradas-full/${codigo}`);
  let bloco = await abrirCorrigir(page);
  await bloco.getByRole('button', { name: 'Reabrir a retirada' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/retiradas-full/${codigo}\\?ok=reaberta$`));
  // A tela da retirada aberta tem os próprios avisos (role=status): a confirmação é achada pelo texto.
  await expect(page.getByText('Retirada reaberta. Corrija os itens e as quantidades e conclua de novo.')).toBeVisible();
  await expect(page.getByText('Aberta', { exact: true })).toBeVisible();
  expect(await comBanco(async (db) => (await db.select({ s: retiradasFull.situacao }).from(retiradasFull).where(eq(retiradasFull.codigo, codigo)))[0]?.s)).toBe(
    'ABERTA',
  );

  bloco = await abrirCorrigir(page);
  await expect(bloco.getByRole('button', { name: 'Reabrir a retirada' })).toHaveCount(0);
  await confirmar(page, bloco, 'Apagar retirada', /^Tem certeza\? A .* vai para Apagadas\./, 'Sim, apagar retirada');
  await expect(page).toHaveURL(new RegExp(`/fluxo/retiradas-full\\?apagada=${codigo}$`));
  await expect(page.getByRole('status')).toHaveText(`${codigo} apagada. Ela fica em Apagadas por 90 dias.`);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toHaveCount(0);

  await page.goto('/fluxo/apagadas');
  const linha = page.getByRole('listitem').filter({ hasText: codigo });
  await expect(linha).toContainText('Retirada do Full');
  await expect(linha).toContainText('Estava em: Aberta');
  const restaurar = linha.getByRole('button', { name: `Restaurar ${codigo}` });
  await aguardarHidratacao(restaurar);
  await restaurar.click();
  await expect(page.getByRole('status')).toHaveText(`${codigo} restaurada. Ela voltou para Aberta.`);
  await page.goto('/fluxo/retiradas-full');
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
});

test('Operador e Fiscal não veem o "Corrigir (Gestor)" nem a lista Apagadas', async ({ page }) => {
  const { devolucao, retirada } = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const dev = await criarDevolucaoChegada(db, operador, { rastreio: codigoUnico('PF') });
    const r = await criarRetiradaTeste(db, operador, { itens: [{ eanLido: codigoUnico('789'), descricao: 'Cabo', quantidade: 1 }], concluidaEm: new Date() });
    return { devolucao: dev.codigo, retirada: r.codigo };
  });
  for (const usuario of [USUARIOS_E2E.operador, USUARIOS_E2E.fiscal]) {
    await page.context().clearCookies();
    await entrarComo(page, usuario);
    await page.goto(`/fluxo/devolucoes/${devolucao}`);
    await expect(page.getByRole('heading', { level: 1, name: devolucao })).toBeVisible();
    await expect(page.getByText(NOME_BLOCO)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Desfazer a chegada|Apagar devolução/ })).toHaveCount(0);
    await page.goto(`/fluxo/retiradas-full/${retirada}`);
    await expect(page.getByRole('heading', { level: 1, name: retirada })).toBeVisible();
    await expect(page.getByText(NOME_BLOCO)).toHaveCount(0);
    await page.goto('/fluxo');
    const menu = await abrirMenuAcoes(page);
    await expect(menu.getByRole('link', { name: 'Apagadas' })).toHaveCount(0);
    await paginaNaoEncontrada(page, '/fluxo/apagadas');
  }
});
