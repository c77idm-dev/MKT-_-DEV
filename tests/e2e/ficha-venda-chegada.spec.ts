/**
 * (extra, emenda E27) A ficha da venda onde se lê o número do pedido do ML: no Receber pacote ("Dar chegada"), no
 * Conferir pacote ("Iniciar conferência") e na etiqueta amarela da Retirada do Full ("Dar chegada nesta devolução").
 * Pelo número do pedido nada é registrado sem o toque numa devolução. Com uma devolução, a ficha; com mais de uma, a
 * lista. Roda no computador e no celular (390×844).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { criarRetiradaTeste } from '../helpers/fabricas-retiradas';
import { abrirReceberPacote, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { esperarEnviada, fotoDeTeste } from './apoio-conferencia';
import { alvosDeToque44 } from './apoio-ml';
import { devolucoesDoPedido, gravarVenda, pedidoML, statusDas } from './apoio-pedido-ml';
import { USUARIOS_E2E } from './dados';

/** E27: o botão da ficha só vale 0,7 s depois de ela aparecer (TRAVA_TOQUE_DUPLO_MS, em useTravaToqueDuplo.ts). */
const TRAVA_TOQUE_DUPLO_MS = 700;

/** Espera a trava do toque duplo e toca no botão (o toque de antes da trava não vale, de propósito). */
async function tocarDepoisDaTrava(page: Page, botao: Locator) {
  await expect(botao).toBeEnabled();
  await page.waitForTimeout(TRAVA_TOQUE_DUPLO_MS + 100);
  await botao.click();
}

test.describe('Receber pacote pelo número do pedido do ML', () => {
  test('uma devolução esperando: a ficha da venda e "Dar chegada"; nada é registrado antes do toque', async ({ page }) => {
    const pedido = pedidoML();
    const [d] = await devolucoesDoPedido(pedido, ['NO_CD_MARKETPLACE']);
    await gravarVenda(pedido, { titulo: 'Fone Bluetooth da venda', sku: 'SKU-VENDA-E27', valor: 129.9 });
    await entrarComo(page, USUARIOS_E2E.operador);
    await abrirReceberPacote(page);
    // A etiqueta corta o "2" do começo do pedido.
    await page.getByLabel('Código de Rastreamento').fill(pedido.slice(1));
    await page.getByRole('button', { name: 'Registrar chegada' }).click();

    const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
    await expect(escolha).toContainText('Achada pelo número do pedido do ML (extra).');
    await expect(escolha).toContainText('A chegada ainda não foi registrada.');
    await expect(escolha).toContainText(d.codigo);
    await expect(escolha).toContainText(pedido);
    await expect(escolha).toContainText('Paga · Entregue');
    await expect(escolha).toContainText('Fone Bluetooth da venda');
    await expect(escolha).toContainText('1 × R$ 129,90');
    await expect(escolha.getByRole('link', { name: /Abrir a venda no ML/ })).toHaveAttribute('href', `https://www.mercadolivre.com.br/vendas/${pedido}/detalhe`);
    await expect(page.getByRole('status')).toContainText('Confira antes de dar a chegada');
    expect(await statusDas([d.codigo])).toEqual(['NO_CD_MARKETPLACE']);
    await alvosDeToque44(escolha);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, escolha.getByRole('button', { name: `Dar chegada na ${d.codigo}` }));
    const resultado = page.getByRole('status');
    await expect(resultado).toContainText('Chegada registrada');
    await expect(resultado).toContainText(`${d.codigo} · voltou do armazém do ML (extra)`);
    await expect(page.getByTestId('cartao-resultado')).toContainText('Achada pelo número do pedido do ML (extra).');
    await expect(escolha).toHaveCount(0);
    expect(await statusDas([d.codigo])).toEqual(['AGUARDANDO_CONFERENCIA']);
    await semRolagemLateral(page);

    // Ler o mesmo pedido de novo: "Este pacote já chegou", como na E25.
    await page.getByLabel('Código de Rastreamento').fill(pedido);
    await page.getByRole('button', { name: 'Registrar chegada' }).click();
    await expect(resultado).toContainText('Este pacote já chegou');

    await page.goto(`/fluxo/devolucoes/${d.codigo}`);
    const historico = page.getByRole('region', { name: 'Histórico' });
    await expect(historico).toContainText('Chegada registrada (voltou do armazém do ML)');
    await expect(historico).toContainText('No CD do marketplace → Aguardando conferência');
  });

  test('mais de uma esperando: a lista, e só a devolução tocada chega', async ({ page }) => {
    const pedido = pedidoML();
    const [a, b, c] = await devolucoesDoPedido(pedido, ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE', 'CONCLUIDA']);
    await entrarComo(page, USUARIOS_E2E.operador);
    await abrirReceberPacote(page);
    const campo = page.getByLabel('Código de Rastreamento');
    await campo.fill(pedido);
    await campo.press('Enter');

    const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
    await expect(escolha).toContainText('Este pedido tem 2 devoluções esperando o pacote.');
    const itens = escolha.getByRole('list', { name: 'Devoluções do pedido' }).getByRole('listitem');
    await expect(itens).toHaveCount(2);
    await expect(itens.nth(0)).toContainText(a.codigo);
    await expect(itens.nth(0)).toContainText(a.produto);
    await expect(itens.nth(1)).toContainText(b.codigo);
    await expect(itens.nth(1)).toContainText(b.produto);
    await expect(escolha).not.toContainText(c.codigo);
    await alvosDeToque44(escolha);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, itens.nth(1).getByRole('button', { name: `Dar chegada na ${b.codigo}` }));
    const resultado = page.getByRole('status');
    await expect(resultado).toContainText('Chegada registrada');
    await expect(resultado).toContainText(b.codigo);
    expect(await statusDas([a.codigo, b.codigo, c.codigo])).toEqual(['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'CONCLUIDA']);

    // O mesmo pedido de novo: só a outra ainda espera, e aparece a ficha dela (sem os dados da venda; criada à mão, sem
    // reclamação no sistema, a ficha diz por quê).
    await campo.fill(pedido);
    await campo.press('Enter');
    await expect(escolha).toContainText(a.codigo);
    await expect(escolha).toContainText('Sem os dados da venda do ML (devolução sem reclamação no sistema).');
    // (extra) Sem os itens da venda, a ficha mostra o produto esperado, para comparar com o pacote na mão.
    await expect(escolha.getByRole('list', { name: 'Produto esperado' })).toContainText(a.produto);
    await expect(escolha.getByRole('list', { name: 'Devoluções do pedido' })).toHaveCount(0);
    expect(await statusDas([a.codigo])).toEqual(['PENDENTE_CHEGADA']);
    await semRolagemLateral(page);
  });
});

test.describe('Conferir pacote pelo número do pedido do ML', () => {
  test('uma devolução aberta: a ficha com "Iniciar conferência" (não abre sozinha)', async ({ page }) => {
    const pedido = pedidoML();
    const [d] = await devolucoesDoPedido(pedido, ['AGUARDANDO_CONFERENCIA']);
    await gravarVenda(pedido, { titulo: 'Carregador da venda', sku: 'SKU-CARREGADOR-E27', valor: 59.5 });
    await entrarComo(page, USUARIOS_E2E.operador);
    await page.goto('/fluxo/conferencia');
    await page.getByLabel('Código de Rastreamento, código DEV ou número do pedido do ML (extra)').fill(pedido.slice(1));
    await page.getByRole('button', { name: 'Abrir conferência' }).click();

    const ficha = page.getByRole('region', { name: /Achada pelo número do pedido do ML/ });
    await expect(ficha).toContainText(d.codigo);
    await expect(ficha).toContainText('Carregador da venda');
    await expect(ficha).toContainText('R$ 59,50');
    await expect(page).toHaveURL(/\/fluxo\/conferencia$/);
    await alvosDeToque44(ficha);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, ficha.getByRole('button', { name: `Iniciar conferência da ${d.codigo}` }));
    await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}/conferencia$`));
  });

  test('mais de uma aberta: a lista, e abre a tocada; pedido desconhecido cita o pedido na mensagem', async ({ page }) => {
    const pedido = pedidoML();
    const [a, b, c] = await devolucoesDoPedido(pedido, ['AGUARDANDO_CONFERENCIA', 'AGUARDANDO_CONFERENCIA', 'PENDENTE_CHEGADA']);
    await entrarComo(page, USUARIOS_E2E.operador);
    await page.goto('/fluxo/conferencia');
    const campo = page.getByLabel('Código de Rastreamento, código DEV ou número do pedido do ML (extra)');
    await campo.fill(pedidoML());
    await page.getByRole('button', { name: 'Abrir conferência' }).click();
    await expect(page.locator('#erros-formulario')).toContainText('Nenhuma devolução com este código de rastreamento ou número do pedido do ML.');

    await campo.fill(pedido);
    await page.getByRole('button', { name: 'Abrir conferência' }).click();
    const lista = page.getByRole('region', { name: /Achadas pelo número do pedido do ML/ });
    await expect(lista).toContainText('Este pedido tem 2 devoluções para conferir.');
    const itens = lista.getByRole('list', { name: 'Devoluções do pedido' }).getByRole('listitem');
    await expect(itens).toHaveCount(2);
    await expect(itens.nth(0)).toContainText(a.codigo);
    await expect(itens.nth(1)).toContainText(b.codigo);
    await expect(lista).not.toContainText(c.codigo);
    await alvosDeToque44(lista);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, itens.nth(1).getByRole('button', { name: `Iniciar conferência da ${b.codigo}` }));
    await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${b.codigo}/conferencia$`));
    expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA']);
  });
});

test.describe('Retirada do Full: etiqueta amarela (devolução do ML)', () => {
  async function abrirRetirada(page: Page): Promise<string> {
    const retirada = await comBanco(async (db) => criarRetiradaTeste(db, await usuarioPorEmail(db, USUARIOS_E2E.operador.email), { itens: [] }));
    await entrarComo(page, USUARIOS_E2E.operador);
    await page.goto(`/fluxo/retiradas-full/${retirada.codigo}`);
    await page.waitForLoadState('networkidle'); // hidratação: o botão abre o campo
    return retirada.codigo;
  }

  async function procurarPedido(page: Page, numero: string) {
    await page.getByRole('button', { name: 'Etiqueta amarela (devolução do ML)' }).click();
    await page.getByLabel('Número do pedido (impresso na etiqueta)').fill(numero);
    await page.getByRole('button', { name: 'Procurar', exact: true }).click();
  }

  test('a ficha com "Dar chegada nesta devolução": a chegada é registrada pela retirada e não entra nos itens', async ({ page }) => {
    const pedido = pedidoML();
    const [d] = await devolucoesDoPedido(pedido, ['NO_CD_MARKETPLACE']);
    await gravarVenda(pedido, { titulo: 'Fone da etiqueta amarela', sku: 'SKU-AMARELA-E27', valor: 89.9 });
    const rf = await abrirRetirada(page);
    await procurarPedido(page, pedido.slice(1));

    const secao = page.getByRole('region', { name: /Devolução do ML no pacote/ });
    await expect(secao).toContainText(d.codigo);
    await expect(secao).toContainText('Fone da etiqueta amarela');
    await expect(secao).toContainText('A chegada ainda não foi registrada.');
    expect(await statusDas([d.codigo])).toEqual(['NO_CD_MARKETPLACE']);
    await alvosDeToque44(secao);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, secao.getByRole('button', { name: `Dar chegada nesta devolução ${d.codigo}` }));
    const aviso = page.getByRole('status').filter({ hasText: 'Chegada registrada' });
    await expect(aviso).toContainText(`${d.codigo} · voltou do armazém do ML (extra)`);
    await expect(aviso).toContainText('não entra nos itens desta retirada');
    await expect(page.getByRole('heading', { name: 'Itens (0)' })).toBeVisible();
    await expect(page.getByText('Nenhum produto bipado ainda.')).toBeVisible();
    expect(await statusDas([d.codigo])).toEqual(['AGUARDANDO_CONFERENCIA']);
    await semRolagemLateral(page);

    // Decisão do usuário de 24/11: só com a etiqueta amarela, sem produto bipado, a retirada também conclui.
    await expect(page.getByText(`0 itens · 1 devolução pela etiqueta amarela (extra) · ${rf}`)).toBeVisible();
    await page.getByLabel('Tirar Foto da etiqueta', { exact: true }).setInputFiles(await fotoDeTeste('etiqueta-amarela.jpg'));
    await esperarEnviada(page, 'Foto da etiqueta');
    await page.getByRole('button', { name: 'Concluir retirada' }).click();
    await expect(page.getByText('Conferida', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir retirada' })).toHaveCount(0);

    await page.goto(`/fluxo/devolucoes/${d.codigo}`);
    await expect(page.getByRole('region', { name: 'Histórico' })).toContainText(`Chegada registrada (voltou do armazém do ML) (pela Retirada do Full ${rf})`);
  });

  test('mais de uma esperando: a lista, só a tocada chega; pedido desconhecido avisa', async ({ page }) => {
    const pedido = pedidoML();
    const [a, b] = await devolucoesDoPedido(pedido, ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE']);
    await abrirRetirada(page);
    const desconhecido = pedidoML();
    await procurarPedido(page, desconhecido);
    await expect(page.getByRole('alert').filter({ hasText: 'Nenhuma devolução do ML' })).toContainText(`Nenhuma devolução do ML com o pedido ${desconhecido}.`);

    await page.getByLabel('Número do pedido (impresso na etiqueta)').fill(pedido);
    await page.getByRole('button', { name: 'Procurar', exact: true }).click();
    const secao = page.getByRole('region', { name: /Devolução do ML no pacote/ });
    const itens = secao.getByRole('list', { name: 'Devoluções do pedido' }).getByRole('listitem');
    await expect(itens).toHaveCount(2);
    await expect(itens.nth(0)).toContainText(a.produto);
    await expect(itens.nth(1)).toContainText(b.produto);
    await alvosDeToque44(secao);
    await semRolagemLateral(page);

    await tocarDepoisDaTrava(page, itens.nth(0).getByRole('button', { name: `Dar chegada nesta devolução ${a.codigo}` }));
    await expect(page.getByRole('status').filter({ hasText: 'Chegada registrada' })).toContainText(a.codigo);
    expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);
    await expect(page.getByRole('heading', { name: 'Itens (0)' })).toBeVisible();
  });
});
