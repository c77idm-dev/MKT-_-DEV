import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
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
