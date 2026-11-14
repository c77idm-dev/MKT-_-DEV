import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { binariosFfmpeg, sondar, temFfmpeg } from './ffmpeg';
import { transcodificarVideo } from './processamento';

const comFfmpeg = await temFfmpeg();
const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T19:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'video-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

async function videoRecebido(gerar: boolean) {
  const d = await criarDevolucaoEmConferencia(db, operador);
  const caminho = join(pasta, 'upload-video');
  if (gerar) {
    // 2 s de imagem de teste 640×360 com som, como sairia de um celular (mais ou menos).
    execFileSync(
      binariosFfmpeg().ffmpeg,
      [
        '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest',
        '-c:v', 'mpeg4', '-c:a', 'aac', '-f', 'mp4', caminho,
      ],
      { stdio: 'ignore' },
    );
  } else {
    await writeFile(caminho, Buffer.alloc(4096, 7));
  }
  const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA', caminhoTemporario: caminho, usuarioId: operador.id });
  return { d, id, caminho };
}

describe.skipIf(!comFfmpeg)('transcodificarVideo (precisa do ffmpeg instalado)', () => {
  it('converte para H.264, guarda como mp4, marca PRONTA e só então apaga o original', async () => {
    const { d, id, caminho } = await videoRecebido(true);
    await transcodificarVideo(db, id, { tentativa: 1, agora });
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, id));
    expect(e).toMatchObject({ situacaoProcessamento: 'PRONTA', caminho: `evidencias/${d.id}/${id}.mp4`, tipoConteudo: 'video/mp4', caminhoTemporario: null });
    expect(existsSync(caminho)).toBe(false);
    const guardado = (obterArmazenamento() as ArmazenamentoMemoria).arquivos.get(e.caminho!);
    const conferir = join(pasta, 'conferir.mp4');
    await writeFile(conferir, guardado!.conteudo);
    expect(await sondar(binariosFfmpeg().ffprobe, conferir)).toMatchObject({ codecVideo: 'h264', largura: 640, altura: 360 });
  });

  it('arquivo que não é vídeo: na última tentativa fica FALHOU e o original é mantido', async () => {
    const { id, caminho } = await videoRecebido(false);
    await expect(transcodificarVideo(db, id, { tentativa: 5, agora })).rejects.toThrow(/ffprobe/);
    const [e] = await db.select({ situacao: evidencias.situacaoProcessamento }).from(evidencias).where(eq(evidencias.id, id));
    expect(e.situacao).toBe('FALHOU');
    expect(existsSync(caminho)).toBe(true);
  });
});
