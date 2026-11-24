import { expect, test, type Page, type Request } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { devolucoesDoPedido, pedidoML, statusDas } from './apoio-pedido-ml';
import { USUARIOS_E2E } from './dados';

// "Câmera falsa" do Chromium e um BarcodeDetector falso: o código "lido" é o que o teste põe na fila.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

type JanelaComFila = Window & { __lerCodigo: (codigo: string) => void; __naFila: () => number };

async function instalarDetectorFalso(page: Page) {
  await page.addInitScript(() => {
    const fila: string[] = [];
    (window as unknown as JanelaComFila).__lerCodigo = (codigo) => fila.push(codigo);
    (window as unknown as JanelaComFila).__naFila = () => fila.length;
    const formatos = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417'];
    class DetectorFalso {
      static async getSupportedFormats() {
        return formatos;
      }
      async detect() {
        const codigo = fila.shift();
        return codigo ? [{ rawValue: codigo }] : [];
      }
    }
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = DetectorFalso;
  });
}

/** A câmera "lê" o código e o teste espera a resposta do servidor e o formulário livre de novo. */
async function lerPelaCamera(page: Page, codigo: string) {
  const resposta = page.waitForResponse((r) => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined);
  await page.evaluate((c) => (window as unknown as JanelaComFila).__lerCodigo(c), codigo);
  await resposta;
  await expect(page.getByRole('button', { name: 'Registrar chegada' })).toBeEnabled();
}

/**
 * (E27) A câmera "lê" o código e a tela o ignora (podeAceitarLeitura): nada vai ao servidor. Espera o detector falso
 * tirar o código da fila e mais um tempo para um envio sair, se fosse sair.
 */
async function lerPelaCameraSemEnviar(page: Page, codigo: string) {
  let enviados = 0;
  const contar = (r: Request) => {
    if (r.method() === 'POST' && r.headers()['next-action'] !== undefined) enviados += 1;
  };
  page.on('request', contar);
  await page.evaluate((c) => (window as unknown as JanelaComFila).__lerCodigo(c), codigo);
  await page.waitForFunction(() => (window as unknown as JanelaComFila).__naFila() === 0);
  await page.waitForTimeout(600);
  page.off('request', contar);
  expect(enviados).toBe(0);
}

function digitos(n: number): string {
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
}

test('(extra, E25) pela câmera, outro código da mesma etiqueta do ML não troca o cartão verde por "já chegou"', async ({ page }) => {
  const pedido = `2${String(Date.now()).padStart(13, '0')}${digitos(2)}`;
  const envio = `${String(Date.now() % 1e9).padStart(9, '0')}${digitos(2)}`;
  const rastreio = `MM${envio}BRSP02`;
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const criada = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido, rastreio });
    await db.update(devolucoes).set({ status: 'NO_CD_MARKETPLACE' }).where(eq(devolucoes.codigo, criada.codigo));
    return criada.codigo;
  });
  await instalarDetectorFalso(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByRole('button', { name: 'Fechar câmera' })).toBeVisible();
  await expect(page.getByText('Abrindo a câmera…')).toHaveCount(0);

  const resultado = page.getByRole('status');
  await lerPelaCamera(page, rastreio);
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(`${codigo} · voltou do armazém do ML (extra)`);

  // A câmera pega o número do pedido e depois o do envio, da mesma etiqueta: o cartão verde fica.
  for (const outro of [pedido.slice(1), envio]) {
    await lerPelaCamera(page, outro);
    await expect(resultado).toContainText('Chegada registrada');
    await expect(resultado).toContainText(`${codigo} · voltou do armazém do ML (extra)`);
    await expect(resultado).not.toContainText('Este pacote já chegou');
  }
  await semRolagemLateral(page);

  // Pelo campo (digitação ou leitor USB) o aviso aparece como sempre.
  await page.getByRole('button', { name: 'Fechar câmera' }).click();
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(pedido);
  await campo.press('Enter');
  await expect(resultado).toContainText('Este pacote já chegou');
  await expect(resultado).toContainText(`${codigo} já tinha chegado`);
});

test('(extra, E27) pela câmera, ler de novo o mesmo pedido não fecha a ficha; depois de "Dar chegada", o cartão verde fica', async ({ page }) => {
  const pedido = pedidoML();
  const [a, b] = await devolucoesDoPedido(pedido, ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE']);
  await instalarDetectorFalso(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByRole('button', { name: 'Fechar câmera' })).toBeVisible();
  await expect(page.getByText('Abrindo a câmera…')).toHaveCount(0);

  await lerPelaCamera(page, pedido.slice(1));
  const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
  const itens = escolha.getByRole('list', { name: 'Devoluções do pedido' }).getByRole('listitem');
  await expect(itens).toHaveCount(2);
  // Marca o bloco na tela: se ele fosse montado de novo, a marca sumiria (e a trava do toque duplo recomeçaria).
  await escolha.evaluate((el) => el.setAttribute('data-marca-e2e', '1'));

  // A câmera continua vendo a etiqueta e lê o mesmo pedido, agora com o "2" do começo: com a ficha na tela a leitura é
  // ignorada no próprio aparelho (podeAceitarLeitura) e a ficha fica. (O mesmo código lido de novo em menos de 3 s nem
  // chega à tela: PAUSA_MESMO_CODIGO_MS, em useLeitorCamera.ts.)
  await lerPelaCameraSemEnviar(page, pedido);
  await expect(escolha).toHaveAttribute('data-marca-e2e', '1');
  await expect(itens).toHaveCount(2);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE']);

  const dar = itens.nth(0).getByRole('button', { name: `Dar chegada na ${a.codigo}` });
  await expect(dar).toBeEnabled();
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await dar.click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);

  // O mesmo pedido de novo pela câmera: o cartão verde fica (a outra devolução do pedido não toma o lugar dele) e avisa
  // que a outra ainda espera o pacote.
  await page.waitForTimeout(3100); // passa a pausa do mesmo código (3 s) desde a 1ª leitura
  await lerPelaCamera(page, pedido.slice(1));
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);
  await expect(resultado).toContainText(`${b.codigo} ainda espera o pacote`);
  await expect(page.getByTestId('aviso-ainda-esperam')).toContainText(`${b.codigo} ainda espera o pacote`);
  await expect(escolha).toHaveCount(0);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);
  await semRolagemLateral(page);
});

test('(extra, E27) pela câmera, outro código da mesma etiqueta que o sistema não conhece não troca a ficha do pedido', async ({ page }) => {
  // Caso real da E25: o pacote volta do armazém do ML num envio novo, e o número dele (11 dígitos) não está em nenhum
  // rastreio. Com a ficha na tela, a câmera não manda nada: nem "Rastreio não encontrado", nem não identificada a mais.
  const pedido = pedidoML();
  const [d] = await devolucoesDoPedido(pedido, ['NO_CD_MARKETPLACE']);
  const envioNovo = `${String(Date.now() % 1e9).padStart(9, '0')}${digitos(2)}`;
  await instalarDetectorFalso(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByRole('button', { name: 'Fechar câmera' })).toBeVisible();
  await expect(page.getByText('Abrindo a câmera…')).toHaveCount(0);

  await lerPelaCamera(page, pedido.slice(1));
  const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
  await expect(escolha).toContainText(d.codigo);
  await escolha.evaluate((el) => el.setAttribute('data-marca-e2e', '1'));

  await lerPelaCameraSemEnviar(page, envioNovo);
  await expect(escolha).toHaveAttribute('data-marca-e2e', '1');
  await expect(page.getByText('Rastreio não encontrado')).toHaveCount(0);
  expect(await statusDas([d.codigo])).toEqual(['NO_CD_MARKETPLACE']);
  const comEsseRastreio = await comBanco((db) => db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.rastreio, envioNovo)));
  expect(comEsseRastreio).toHaveLength(0);

  // A pessoa confere a venda e toca: a chegada é registrada normalmente.
  await page.waitForTimeout(800); // trava do toque duplo (0,7 s)
  await escolha.getByRole('button', { name: `Dar chegada na ${d.codigo}` }).click();
  const resultado = page.getByRole('status');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(`${d.codigo} · voltou do armazém do ML (extra)`);
  expect(await statusDas([d.codigo])).toEqual(['AGUARDANDO_CONFERENCIA']);
  await semRolagemLateral(page);
});

test('(extra, E27) pela câmera, o cartão verde da chegada pelo rastreio fica diante do número do pedido da mesma etiqueta', async ({ page }) => {
  // A espera o pacote com o rastreio RA; B, do mesmo pedido, voltou do armazém com outro rastreio e não está aqui.
  const pedido = pedidoML();
  const ra = `MM${String(Date.now() % 1e9).padStart(9, '0')}${digitos(2)}BRSP02`;
  const rb = `MM${String((Date.now() + 7) % 1e9).padStart(9, '0')}${digitos(2)}BRSP03`;
  const [a, b] = await devolucoesDoPedido(pedido, ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'], [ra, rb]);
  await instalarDetectorFalso(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByRole('button', { name: 'Fechar câmera' })).toBeVisible();
  await expect(page.getByText('Abrindo a câmera…')).toHaveCount(0);

  const resultado = page.getByRole('status');
  const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
  await lerPelaCamera(page, ra);
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);

  // A câmera pega o número do pedido na mesma etiqueta: o cartão verde de A fica, sem a ficha de B, e avisa que B espera.
  await lerPelaCamera(page, pedido.slice(1));
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);
  await expect(resultado).toContainText(`${b.codigo} ainda espera o pacote`);
  await expect(escolha).toHaveCount(0);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);

  // O rastreio de A de novo, depois da pausa do mesmo código: o cartão verde continua.
  await page.waitForTimeout(3100);
  await lerPelaCamera(page, ra);
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);
  await expect(resultado).not.toContainText('Este pacote já chegou');
  await expect(escolha).toHaveCount(0);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);
  await semRolagemLateral(page);

  // Pelo campo (o que o aviso pede), o número do pedido mostra a ficha de B.
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(pedido);
  await campo.press('Enter');
  await expect(escolha).toContainText(b.codigo);
  await expect(escolha).not.toContainText(a.codigo);
});

test('(extra, E27; 24/11) pela câmera, o amarelo "Este pacote já chegou" fica diante do número do pedido da mesma etiqueta', async ({ page }) => {
  // A já tinha chegado (rastreio RA); B, do mesmo pedido, voltou do armazém com outro rastreio e não está aqui.
  const pedido = pedidoML();
  const ra = `MM${String(Date.now() % 1e9).padStart(9, '0')}${digitos(2)}BRSP02`;
  const rb = `MM${String((Date.now() + 7) % 1e9).padStart(9, '0')}${digitos(2)}BRSP03`;
  const [a, b] = await devolucoesDoPedido(pedido, ['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE'], [ra, rb]);
  await instalarDetectorFalso(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  await expect(page.getByRole('button', { name: 'Fechar câmera' })).toBeVisible();
  await expect(page.getByText('Abrindo a câmera…')).toHaveCount(0);

  const resultado = page.getByRole('status');
  const escolha = page.getByRole('region', { name: 'Confira antes de dar a chegada' });
  await lerPelaCamera(page, ra);
  await expect(resultado).toContainText('Este pacote já chegou');
  await expect(resultado).toContainText(`${a.codigo} já tinha chegado`);

  // A câmera pega o número do pedido na mesma etiqueta: o amarelo de A fica, sem a ficha de B (nem "Dar chegada"), e
  // avisa que B ainda espera o pacote, em destaque e no anúncio.
  await lerPelaCamera(page, pedido.slice(1));
  await expect(resultado).toContainText('Este pacote já chegou');
  await expect(resultado).toContainText(`${a.codigo} já tinha chegado`);
  await expect(resultado).toContainText(`${b.codigo} ainda espera o pacote`);
  await expect(page.getByTestId('aviso-ainda-esperam')).toContainText(`Do mesmo pedido, a ${b.codigo} ainda espera o pacote.`);
  await expect(escolha).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Dar chegada na ${b.codigo}` })).toHaveCount(0);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);
  await semRolagemLateral(page);

  // A câmera volta ao rastreio de A (outro código que o último lido): o amarelo fica, com o aviso.
  await lerPelaCamera(page, ra);
  await expect(resultado).toContainText(`${a.codigo} já tinha chegado`);
  await expect(page.getByTestId('aviso-ainda-esperam')).toContainText(`${b.codigo} ainda espera o pacote`);
  await expect(escolha).toHaveCount(0);

  // Pelo campo (o que o aviso pede), o número do pedido mostra a ficha de B.
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(pedido);
  await campo.press('Enter');
  await expect(escolha).toContainText(b.codigo);
  await expect(escolha).not.toContainText(a.codigo);
});
