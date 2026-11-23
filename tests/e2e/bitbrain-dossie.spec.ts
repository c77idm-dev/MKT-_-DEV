import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes, evidencias } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { fotoProntaSemArquivo } from './apoio-bitbrain';
import { alvosDeToque44, contestacaoPronta } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

/** Vídeo de Prova PRONTO registrado no banco (sem o arquivo no disco): basta para o link "Baixar vídeo"; no PDF vira aviso. */
async function videoProntoSemArquivo(devolucaoId: string): Promise<void> {
  await comBanco(async (db) => {
    const id = randomUUID();
    await db.insert(evidencias).values({
      id,
      devolucaoId,
      tipo: 'VIDEO_PROVA',
      tipoConteudo: 'video/mp4',
      caminho: `evidencias/${devolucaoId}/${id}.mp4`,
      provedor: 'disco',
      tamanhoOriginal: 10,
      tamanho: 10,
      sha256Original: '1'.repeat(64),
      sha256Final: '2'.repeat(64),
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
  await videoProntoSemArquivo(devolucaoId);

  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/contestacoes/${id}`);
  const bloco = page.locator('section[aria-labelledby="titulo-responda"]');
  await expect(bloco.getByRole('heading', { name: 'Responda no ML' })).toBeVisible();
  const dossie = bloco.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
  await expect(dossie).toHaveAttribute('href', `/api/devolucoes/${codigo}/dossie`);
  await expect(bloco.getByText('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.')).toBeVisible();
  await expect(bloco.getByText('O vídeo vai separado: o ML não aceita vídeo dentro do PDF.')).toBeVisible();
  await expect(bloco.getByRole('link', { name: 'Baixar vídeo' })).toHaveAttribute('download', `${codigo}-video.mp4`);
  await semRolagemLateral(page);
  await alvosDeToque44(bloco);

  // O arquivo da foto e o do vídeo não existem no disco: o PDF sai assim mesmo, com avisos no lugar.
  const [download] = await Promise.all([page.waitForEvent('download'), dossie.click()]);
  expect(download.suggestedFilename()).toBe(`dossie-${codigo}.pdf`);
  expect((await readFile(await download.path())).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
