import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { devolucoesDoPedido, pedidoML, statusDas } from './apoio-pedido-ml';
import { USUARIOS_E2E } from './dados';

// "Câmera falsa" do Chromium e um BarcodeDetector falso: o código "lido" é o que o teste põe na fila.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

type JanelaComFila = Window & { __lerCodigo: (codigo: string) => void };

async function instalarDetectorFalso(page: Page) {
  await page.addInitScript(() => {
    const fila: string[] = [];
    (window as unknown as JanelaComFila).__lerCodigo = (codigo) => fila.push(codigo);
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

  // A câmera continua vendo a etiqueta e lê o mesmo pedido, agora com o "2" do começo: a ficha fica. (O mesmo código
  // lido de novo em menos de 3 s nem sai do aparelho: PAUSA_MESMO_CODIGO_MS, em useLeitorCamera.ts.)
  await lerPelaCamera(page, pedido);
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

  // O mesmo pedido de novo pela câmera: o cartão verde fica (a outra devolução do pedido não toma o lugar dele).
  await page.waitForTimeout(3100); // passa a pausa do mesmo código (3 s) desde a 1ª leitura
  await lerPelaCamera(page, pedido.slice(1));
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(a.codigo);
  await expect(escolha).toHaveCount(0);
  expect(await statusDas([a.codigo, b.codigo])).toEqual(['AGUARDANDO_CONFERENCIA', 'NO_CD_MARKETPLACE']);
  await semRolagemLateral(page);
});
