import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { devolucoes } from '../../src/db/schema';
import { iniciarConferencia } from '../../src/modules/conferencia/trava';
import type { Canal, MotivoItem } from '../../src/modules/devolucoes/dominio';
import { receberPorRastreio } from '../../src/modules/devolucoes/recebimento';
import { criarDevolucaoTeste, criarProdutoTeste } from '../helpers/fabricas';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** O EAN do produto das devoluções de teste (válido, com dígito verificador). */
export const EAN_TESTE = '7891000000014';

export type ArquivoTeste = { name: string; mimeType: string; buffer: Buffer };

/** "Câmera" de teste: o setInputFiles do Playwright entrega este JPEG ao <input capture>. */
export async function fotoDeTeste(nome = 'foto.jpg'): Promise<ArquivoTeste> {
  const buffer = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 90, g: 140, b: 120 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { name: nome, mimeType: 'image/jpeg', buffer };
}

export function temFfmpegE2e(): boolean {
  try {
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 2 s de vídeo de verdade quando há ffmpeg; senão, bytes quaisquer (o envio funciona; o worker é que vai falhar). */
export function videoDeTeste(): ArquivoTeste {
  const destino = resolve('.dados-e2e/fixtures/prova.mp4');
  if (temFfmpegE2e()) {
    if (!existsSync(destino)) {
      mkdirSync(dirname(destino), { recursive: true });
      execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', destino,
      ], { stdio: 'ignore' });
    }
    return { name: 'prova.mp4', mimeType: 'video/mp4', buffer: readFileSync(destino) };
  }
  return { name: 'prova.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(64 * 1024, 7) };
}

/** Devolução que chegou (Aguardando conferência), com `unidades` do mesmo produto; opcionalmente já em conferência. */
export async function prepararConferencia(p: { unidades?: number; canal?: Canal; emConferenciaCom?: keyof typeof USUARIOS_E2E } = {}) {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const sku = codigoUnico('SKU');
    await criarProdutoTeste(db, { sku, ean: EAN_TESTE, descricao: 'Fone Bluetooth de teste' });
    const rastreio = codigoUnico('CF');
    const criada = await criarDevolucaoTeste(db, operador, { rastreio, ...(p.canal ? { canal: p.canal } : {}), itens: [{ sku, quantidade: p.unidades ?? 1 }] });
    await receberPorRastreio(db, rastreio, operador);
    if (p.emConferenciaCom) await iniciarConferencia(db, criada.id, await usuarioPorEmail(db, USUARIOS_E2E[p.emConferenciaCom].email));
    return { id: criada.id, codigo: criada.codigo, rastreio, sku };
  });
}

/** A vaga mostra "Enviada" ou "Pronta" (o envio terminou e o servidor registrou). */
export async function esperarEnviada(page: Page, nome: string) {
  await expect(page.getByRole('group', { name: nome, exact: true })).toContainText(/Enviada|Pronta/, { timeout: 30_000 });
}

/** O que fazer com cada unidade, na ordem (Unidade 1, 2...). */
export type UnidadeE2e = 'BOM' | 'AUSENTE' | { problema: Exclude<MotivoItem, 'AUSENTE'> };

/**
 * Conferência inteira pela tela (contrato §7.3 e §10, E11). As integrações das Fases 3 e 4 usam esta função depois
 * do merge da Fase 2. Antes de chamar, a devolução já chegou (Aguardando conferência ou já em conferência com o
 * Operador) e a `page` está logada como Operador. O EAN não é lido: concluir confirma o produto esperado (decisão 9).
 * O Vídeo de Prova é sempre enviado (padrão SEMPRE). No fim, a página volta ao detalhe da devolução.
 */
export async function conferirDevolucao(page: Page, codigo: string, unidades: UnidadeE2e[]): Promise<void> {
  await comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id, status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    if (d.status === 'AGUARDANDO_CONFERENCIA') await iniciarConferencia(db, d.id, await usuarioPorEmail(db, USUARIOS_E2E.operador.email));
  });
  await page.goto(`/fluxo/devolucoes/${codigo}/conferencia`);
  // Espera a hidratação: sem isso o setInputFiles pode disparar antes de o onChange existir.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('foto-1.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('foto-2.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const [i, u] of unidades.entries()) {
    await expect(page.getByText(`Passo ${i + 2} de `)).toBeVisible();
    if (u === 'AUSENTE') {
      await page.getByRole('button', { name: 'Não veio no pacote (ausente)' }).click();
    } else {
      await page.getByLabel('Tirar Foto 3', { exact: true }).setInputFiles(await fotoDeTeste(`foto-3-${i + 1}.jpg`));
      await page.getByLabel('Tirar Foto 4', { exact: true }).setInputFiles(await fotoDeTeste(`foto-4-${i + 1}.jpg`));
      await esperarEnviada(page, 'Foto 3');
      await esperarEnviada(page, 'Foto 4');
    }
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  await page.getByLabel('Escolher arquivo de vídeo').setInputFiles(videoDeTeste());
  await esperarEnviada(page, 'Vídeo de Prova');
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const [i, u] of unidades.entries()) {
    if (u === 'AUSENTE') continue;
    const grupo = page.getByRole('group', { name: new RegExp(`^Unidade ${i + 1}\\b`) });
    if (u === 'BOM') {
      await grupo.getByLabel('Estoque Bom').check();
    } else {
      await grupo.getByLabel('Estoque Problema').check();
      await page.getByLabel(`Motivo da unidade ${i + 1}`).selectOption(u.problema);
    }
  }
  await expect(page.getByText('Tudo pronto para concluir.')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir conferência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${codigo}$`));
}
