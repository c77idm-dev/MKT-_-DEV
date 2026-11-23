import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes, evidencias } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { fotoProntaSemArquivo } from './apoio-bitbrain';
import { alvosDeToque44, contestacaoPronta } from './apoio-ml';
import { AMBIENTE_E2E, USUARIOS_E2E } from './dados';

/**
 * Vídeo de Prova PRONTO, com o arquivo no disco do e2e (MIDIA_DIR): o "Baixar vídeo" baixa de verdade. Os bytes não
 * são um mp4 válido: no PDF o quadro vira aviso, sem quebrar o dossiê.
 */
async function videoPronto(devolucaoId: string, conteudo: Buffer): Promise<void> {
  const id = randomUUID();
  const caminho = `evidencias/${devolucaoId}/${id}.mp4`;
  const absoluto = resolve(AMBIENTE_E2E.MIDIA_DIR, caminho);
  await mkdir(dirname(absoluto), { recursive: true });
  await writeFile(absoluto, conteudo);
  const sha256 = createHash('sha256').update(conteudo).digest('hex');
  await comBanco(async (db) => {
    await db.insert(evidencias).values({
      id,
      devolucaoId,
      tipo: 'VIDEO_PROVA',
      tipoConteudo: 'video/mp4',
      caminho,
      provedor: 'disco',
      tamanhoOriginal: conteudo.length,
      tamanho: conteudo.length,
      sha256Original: sha256,
      sha256Final: sha256,
      situacaoProcessamento: 'PRONTA',
      idCliente: randomUUID(),
      processadoEm: new Date(),
    });
  });
}

test('"Responda no ML" (modo Bitbrain): dossiê de provas em PDF junto das fotos e o vídeo, que vai separado (extra)', async ({ page }) => {
  const { id, codigo } = await contestacaoPronta({ cenario: 1, motivo: 'AVARIADO' });
  const devolucaoId = await comBanco(async (db) => (await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.codigo, codigo)))[0].id);
  await fotoProntaSemArquivo(devolucaoId);
  const video = Buffer.from(`video-de-prova-${codigo}-${Date.now()}`);
  await videoPronto(devolucaoId, video);

  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/contestacoes/${id}`);
  const bloco = page.locator('section[aria-labelledby="titulo-responda"]');
  await expect(bloco.getByRole('heading', { name: 'Responda no ML' })).toBeVisible();
  const dossie = bloco.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
  await expect(dossie).toHaveAttribute('href', `/api/devolucoes/${codigo}/dossie`);
  await expect(bloco.getByText('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.')).toBeVisible();
  await expect(bloco.getByText('O vídeo vai separado: o ML não aceita vídeo dentro do PDF.')).toBeVisible();
  await expect(bloco.getByText('Os links das fotos e do vídeo valem 10 minutos. Para gerar novos, recarregue a página.')).toBeVisible();
  const baixarVideo = bloco.getByRole('link', { name: 'Baixar vídeo' });
  await expect(baixarVideo).toHaveAttribute('download', `${codigo}-video.mp4`);
  await semRolagemLateral(page);
  await alvosDeToque44(bloco);

  // O vídeo baixa de verdade, com o nome do atributo download e os mesmos bytes do disco.
  const [baixado] = await Promise.all([page.waitForEvent('download'), baixarVideo.click()]);
  expect(baixado.suggestedFilename()).toBe(`${codigo}-video.mp4`);
  expect((await readFile(await baixado.path())).equals(video)).toBe(true);

  // O arquivo da foto não existe no disco e o "vídeo" não é um mp4: o PDF sai assim mesmo, com avisos no lugar.
  const [download] = await Promise.all([page.waitForEvent('download'), dossie.click()]);
  expect(download.suggestedFilename()).toBe(`dossie-${codigo}.pdf`);
  expect((await readFile(await download.path())).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
