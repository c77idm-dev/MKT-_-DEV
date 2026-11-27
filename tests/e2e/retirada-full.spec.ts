import { eq } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import { itensRetiradaFull, retiradasFull } from '../../src/db/schema';
import { criarRetirada } from '../../src/modules/retiradas/retiradas';
import { criarProdutoTeste } from '../helpers/fabricas';
import { abrirMenuAcoes, abrirReceberPacote, codigoUnico, comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral, usuarioPorEmail } from './apoio';
import { esperarEnviada, fotoDeTeste } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

// "Câmera falsa" do Chromium: o leitor abre de verdade; o código é digitado (como o leitor USB), igual aos outros e2e.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

/** EAN só de dígitos e único por execução (o banco do e2e é o mesmo para o computador e o celular). */
function eanUnico(prefixo: string): string {
  return `${prefixo}${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
}

async function bipar(page: Page, ean: string) {
  await page.getByLabel('EAN do produto').fill(ean);
  await page.getByRole('button', { name: 'Somar', exact: true }).click();
}

test('retirada do Full: do "De onde veio este pacote?" (E29) até Conferida (melhoria 3)', async ({ page }) => {
  const etiqueta = codigoUnico('FULL');
  const eanFone = eanUnico('781');
  const eanCarregador = eanUnico('782');
  const eanSemCadastro = eanUnico('783');
  await comBanco(async (db) => {
    await criarProdutoTeste(db, { sku: codigoUnico('SKUF'), ean: eanFone, descricao: 'Fone Bluetooth de teste' });
    await criarProdutoTeste(db, { sku: codigoUnico('SKUC'), ean: eanCarregador, descricao: 'Carregador de teste' });
  });

  await entrarComo(page, USUARIOS_E2E.operador);
  await abrirReceberPacote(page);
  await page.getByLabel('Código de Rastreamento').fill(etiqueta);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  const botaoFull = page.getByRole('button', { name: 'Do armazém do ML (Full)' });
  await expect(botaoFull).toBeVisible();
  await expect(page.getByRole('button', { name: 'De cliente, sem cadastro' })).toBeVisible();
  expect((await botaoFull.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await botaoFull.click();

  await expect(page).toHaveURL(/\/fluxo\/retiradas-full\/RF-\d{6,}$/);
  const codigo = page.url().split('/').pop()!;
  await expect(page.getByText('Isto não é devolução. Confira os itens e guarde no estoque.')).toBeVisible();
  await page.waitForLoadState('networkidle');

  // A câmera falsa abre e fecha pelo leitor do produto.
  await page.getByRole('button', { name: 'Ler código de barras' }).click();
  await expect(page.getByRole('dialog', { name: 'Leitor do código de barras' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar câmera' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Concluir sem a foto e sem item é barrado na tela, com o foco no alerta.
  await page.getByRole('button', { name: 'Concluir retirada' }).click();
  // O anúncio de rota do Next também é role="alert": filtra pelo texto.
  const alerta = page.getByRole('alert').filter({ hasText: 'Tire a foto da etiqueta.' });
  await expect(alerta).toContainText('Tire a foto da etiqueta.');
  await expect(alerta).toContainText('Bipe pelo menos 1 produto.');
  await expect(alerta).toBeFocused();

  await bipar(page, eanFone);
  await expect(page.getByRole('status').filter({ hasText: 'Somado' })).toContainText('Fone Bluetooth de teste (1)');
  await bipar(page, eanFone);
  await expect(page.getByRole('status').filter({ hasText: 'Somado' })).toContainText('Fone Bluetooth de teste (2)');
  await bipar(page, eanCarregador);
  await expect(page.getByRole('heading', { name: 'Carregador de teste' })).toBeVisible();
  await bipar(page, eanSemCadastro);
  await page.getByLabel('Descrição curta').fill('Cabo USB-C genérico');
  await page.getByRole('button', { name: 'Incluir sem cadastro' }).click();
  const semCadastro = page.getByRole('article', { name: 'Cabo USB-C genérico' });
  await expect(semCadastro.getByText('sem cadastro')).toBeVisible();

  // + e − no carregador; "Remover" pede o segundo toque.
  await page.getByRole('button', { name: 'Aumentar Carregador de teste' }).click();
  await expect(page.getByRole('article', { name: 'Carregador de teste' }).getByText('Quantidade: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Diminuir Carregador de teste' }).click();
  await expect(page.getByRole('article', { name: 'Carregador de teste' }).getByText('Quantidade: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Remover Carregador de teste' }).click();
  await expect(page.getByRole('button', { name: 'Toque de novo para remover Carregador de teste' })).toBeVisible();
  await page.getByRole('heading', { name: 'Bipar produto' }).click();
  await expect(page.getByRole('button', { name: 'Remover Carregador de teste' })).toBeVisible();

  // Fotos: a da etiqueta (obrigatória) e a opcional do item, pela mesma fila das evidências.
  await page.getByLabel('Tirar Foto da etiqueta', { exact: true }).setInputFiles(await fotoDeTeste('etiqueta-full.jpg'));
  await semCadastro.getByLabel('Tirar Foto do item', { exact: true }).setInputFiles(await fotoDeTeste('item-full.jpg'));
  await esperarEnviada(page, 'Foto da etiqueta');
  await expect(semCadastro.getByRole('group', { name: 'Foto do item' })).toContainText(/Enviada|Pronta/, { timeout: 30_000 });

  const concluir = page.getByRole('button', { name: 'Concluir retirada' });
  expect((await concluir.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);
  await concluir.click();

  await expect(page.getByText('Conferida', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir retirada' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible();
  await expect(page.getByText('Retirada conferida')).toBeVisible();
  await semRolagemLateral(page);

  const salvo = await comBanco(async (db) => {
    const [r] = await db.select().from(retiradasFull).where(eq(retiradasFull.codigo, codigo));
    const itens = await db.select().from(itensRetiradaFull).where(eq(itensRetiradaFull.retiradaId, r.id));
    return { situacao: r.situacao, etiqueta: r.codigoEtiqueta, quantidades: itens.map((i) => i.quantidade).sort() };
  });
  expect(salvo).toEqual({ situacao: 'CONFERIDA', etiqueta: etiqueta, quantidades: [1, 1, 2] });
});

test('a retirada aparece na lista "Retiradas do Full" e não nas devoluções', async ({ page }) => {
  const etiqueta = codigoUnico('FULLL');
  const { codigo } = await comBanco(async (db) => criarRetirada(db, etiqueta, await usuarioPorEmail(db, USUARIOS_E2E.operador.email)));
  await entrarComo(page, USUARIOS_E2E.operador);
  // (E29) Na Bancada, a retirada aberta aparece com "Continuar", e o link leva à lista.
  await expect(page.getByRole('region', { name: 'Retirada do Full aberta' }).getByRole('link', { name: `Continuar ${codigo}` })).toBeVisible();
  await page.getByRole('link', { name: 'Ver retiradas do Full' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Retiradas do Full' })).toBeVisible();
  const cartao = page.getByRole('link', { name: new RegExp(`^${codigo}`) });
  await expect(cartao).toContainText(`Etiqueta: ${etiqueta}`);
  await expect(cartao).toContainText('Aberta');
  await expect(cartao).toContainText(`Recebida por ${USUARIOS_E2E.operador.nome}`);
  await semRolagemLateral(page);

  // A busca e o quadro são de quem acompanha (E29).
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/busca?rastreio=${etiqueta}`);
  await expect(page.getByText('Nenhuma devolução encontrada.')).toBeVisible();
  await page.goto('/fluxo');
  await expect(page.getByText(codigo)).toHaveCount(0);
  await expect(page.getByText(etiqueta)).toHaveCount(0);
});

test('o Fiscal vê a lista e a retirada, mas não abre nem confere', async ({ page }) => {
  const etiqueta = codigoUnico('FULLF');
  const { codigo } = await comBanco(async (db) => criarRetirada(db, etiqueta, await usuarioPorEmail(db, USUARIOS_E2E.operador.email)));
  await entrarComo(page, USUARIOS_E2E.fiscal);
  // (extra) O Fiscal não passa pelo Recebimento: chega às retiradas pelo menu "O que você quer fazer?" do Fluxo,
  // que mostra só as 2 ações de todos os perfis.
  const menu = await abrirMenuAcoes(page);
  await expect(menu.getByRole('link')).toHaveCount(2);
  await expect(menu.getByRole('link', { name: 'Receber pacote' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Nova devolução' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Planilha Volta ao armazém', exact: true })).toBeVisible();
  const link = menu.getByRole('link', { name: 'Retiradas do Full', exact: true });
  expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);
  await link.click();
  await expect(page).toHaveURL(/\/fluxo\/retiradas-full$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Retiradas do Full' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retirada do Full', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: new RegExp(`^${codigo}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir retirada' })).toHaveCount(0);
  await expect(page.getByLabel('EAN do produto')).toHaveCount(0);
  await paginaNaoEncontrada(page, '/fluxo/retiradas-full/nova');
});
