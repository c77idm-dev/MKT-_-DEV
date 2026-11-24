import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { evidencias } from '../../src/db/schema';
import { linksDoPdf, textoDoPdf } from '../helpers/pdf';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { conferirDevolucao, prepararConferencia, temFfmpegE2e } from './apoio-conferencia';
import { URL_E2E, USUARIOS_E2E } from './dados';

/**
 * E28: quem tem o dossiê de provas (PDF), por exemplo o analista do ML, abre a foto e o vídeo pelo link do PDF, sem
 * login. A foto abre em tamanho original; o vídeo toca no navegador (celular e computador), com controles e sem baixar.
 */
test('dossiê (E28): a foto e o vídeo abrem pelos links do PDF, sem login; o vídeo toca sem baixar', async ({ page }) => {
  test.skip(!temFfmpegE2e(), 'precisa do ffmpeg: o worker converte o vídeo de verdade');
  test.setTimeout(240_000);
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await conferirDevolucao(page, d.codigo, ['BOM']);
  // O worker carimba as fotos e converte o vídeo: os links só vão para as provas prontas.
  await expect
    .poll(
      () =>
        comBanco(async (db) =>
          (await db.select({ situacao: evidencias.situacaoProcessamento }).from(evidencias).where(eq(evidencias.devolucaoId, d.id))).map(
            (e) => e.situacao,
          ),
        ),
      { timeout: 120_000, intervals: [1_000] },
    )
    .toEqual(['PRONTA', 'PRONTA', 'PRONTA', 'PRONTA', 'PRONTA']);

  const resposta = await page.request.get(`/api/devolucoes/${d.codigo}/dossie`);
  expect(resposta.status()).toBe(200);
  const pdf = new Uint8Array(await resposta.body());
  expect(await textoDoPdf(pdf)).toContain('Assistir ao vídeo');
  const links = await linksDoPdf(pdf);
  // 4 fotos (1 e 2 do pacote, 3 e 4 da unidade) + o quadro do vídeo + o "Assistir ao vídeo".
  expect(links).toHaveLength(6);
  const fotos = [...new Set(links.filter((l) => l.uri.startsWith(`${URL_E2E}/api/provas/arquivo?`)).map((l) => l.uri))];
  const videos = [...new Set(links.filter((l) => l.uri.startsWith(`${URL_E2E}/api/provas/video?`)).map((l) => l.uri))];
  expect(fotos).toHaveLength(4);
  expect(videos).toHaveLength(1);

  // Sem sessão: o analista do ML não tem login no sistema.
  await page.context().clearCookies();
  expect(await page.context().cookies()).toEqual([]);
  const downloads: string[] = [];
  page.on('download', (baixado) => downloads.push(baixado.suggestedFilename()));

  // A foto abre no navegador, em tamanho original (a do teste tem 1200×900; o carimbo não reduz).
  const foto = await page.goto(fotos[0]);
  expect(foto!.status()).toBe(200);
  expect(foto!.headers()['content-type']).toBe('image/jpeg');
  expect(foto!.headers()['content-disposition']).toBe('inline');
  const imagem = page.locator('img');
  await expect(imagem).toBeVisible();
  await expect.poll(() => imagem.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([1200, 900]);

  // O vídeo: a página com o player toca no navegador, sem baixar; o arquivo vem em pedaços (Range, 206).
  const pedidosDoArquivo: number[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith(`${URL_E2E}/api/provas/arquivo?`)) pedidosDoArquivo.push(r.status());
  });
  const pagina = await page.goto(videos[0]);
  expect(pagina!.status()).toBe(200);
  expect(pagina!.headers()['content-type']).toBe('text/html; charset=utf-8');
  // allow-scripts só para os controles do player do Safari/WebKit; nenhum script da página (sem script-src).
  expect(pagina!.headers()['content-security-policy']).toMatch(/^sandbox allow-scripts; default-src 'none'; media-src 'self'/);
  expect(pagina!.headers()['content-security-policy']).not.toMatch(/script-src|allow-same-origin/);
  await expect(page.getByRole('heading', { name: `Vídeo de Prova · ${d.codigo}` })).toBeVisible();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('playsinline', '');
  // Os metadados chegaram pelo Range (206): o navegador já sabe a duração (o vídeo de teste tem 2 s).
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(2, 0);
  // Toca de verdade: sem erro, o tempo anda.
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull();
  expect(pedidosDoArquivo).toContain(206);
  await semRolagemLateral(page);
  expect(downloads).toEqual([]);
});
