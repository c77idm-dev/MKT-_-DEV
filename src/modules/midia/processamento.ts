import { createReadStream } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, evidencias, usuarios } from '@/db/schema';
import { CONFIG_TAREFAS, type NomeTarefa } from '@/modules/fila/tarefas';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterArmazenamento, provedorAtual } from './armazenamento';
import { carimbarFoto } from './carimbo';
import { chaveEvidencia } from './chaves';
import { binariosFfmpeg, conferirTranscodificacao, sondar, transcodificar, type Binarios } from './ffmpeg';
import { sha256DoArquivo, sha256DoBuffer } from './hash';
import { apagarTemporario } from './temporarios';

export type ContextoProcessamento = { tentativa: number; agora: Date };

const EM_ANDAMENTO = ['RECEBIDA', 'PROCESSANDO'] as const;

async function carregar(db: Db, evidenciaId: string) {
  const [e] = await db
    .select({
      id: evidencias.id,
      devolucaoId: evidencias.devolucaoId,
      itemId: evidencias.itemId,
      tipo: evidencias.tipo,
      situacao: evidencias.situacaoProcessamento,
      caminhoTemporario: evidencias.caminhoTemporario,
      sha256Original: evidencias.sha256Original,
      enviadoEm: evidencias.enviadoEm,
      codigo: devolucoes.codigo,
      usuarioNome: usuarios.nome,
    })
    .from(evidencias)
    .innerJoin(devolucoes, eq(devolucoes.id, evidencias.devolucaoId))
    .leftJoin(usuarios, eq(usuarios.id, evidencias.enviadoPor))
    .where(eq(evidencias.id, evidenciaId));
  return e ?? null;
}

export type EvidenciaEmProcessamento = NonNullable<Awaited<ReturnType<typeof carregar>>> & { caminhoTemporario: string };

/** Marca PROCESSANDO. null = nada a fazer (apagada ao refazer, já pronta ou já falhou): o manipulador é idempotente. */
export async function comecar(db: Db, evidenciaId: string): Promise<EvidenciaEmProcessamento | null> {
  const e = await carregar(db, evidenciaId);
  if (!e || !(EM_ANDAMENTO as readonly string[]).includes(e.situacao) || !e.caminhoTemporario) return null;
  await db.update(evidencias).set({ situacaoProcessamento: 'PROCESSANDO' }).where(eq(evidencias.id, evidenciaId));
  return { ...e, caminhoTemporario: e.caminhoTemporario };
}

/** PRONTA + evento com os dois hashes (spec §9). false = a evidência foi refeita enquanto processava (o arquivo novo sobra). */
export async function concluirProcessamento(
  db: Db,
  e: EvidenciaEmProcessamento,
  final: { chave: string; tipoConteudo: string; tamanho: number; sha256Final: string },
  agora: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .update(evidencias)
      .set({
        caminho: final.chave,
        provedor: provedorAtual(),
        tipoConteudo: final.tipoConteudo,
        tamanho: final.tamanho,
        sha256Final: final.sha256Final,
        situacaoProcessamento: 'PRONTA',
        erroProcessamento: null,
        caminhoTemporario: null,
        processadoEm: agora,
      })
      .where(and(eq(evidencias.id, e.id), inArray(evidencias.situacaoProcessamento, [...EM_ANDAMENTO])))
      .returning({ id: evidencias.id });
    if (!linha) return false;
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: e.devolucaoId,
      acao: 'evidencia_processada',
      usuarioId: null,
      em: agora,
      dados: { evidenciaId: e.id, tipo: e.tipo, itemId: e.itemId, sha256_original: e.sha256Original, sha256_final: final.sha256Final },
    });
    return true;
  });
}

/** Erro numa tentativa (decisão 8): na última, FALHOU e evento; antes, volta para RECEBIDA para a próxima tentativa. */
export async function registrarErro(db: Db, e: EvidenciaEmProcessamento, tarefa: NomeTarefa, erro: unknown, ctx: ContextoProcessamento): Promise<void> {
  const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
  const ultima = ctx.tentativa >= CONFIG_TAREFAS[tarefa].tentativas;
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(evidencias)
      .set({ situacaoProcessamento: ultima ? 'FALHOU' : 'RECEBIDA', erroProcessamento: mensagem })
      .where(and(eq(evidencias.id, e.id), inArray(evidencias.situacaoProcessamento, [...EM_ANDAMENTO])))
      .returning({ id: evidencias.id });
    if (linha && ultima) {
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: e.devolucaoId,
        acao: 'evidencia_falhou',
        usuarioId: null,
        em: ctx.agora,
        dados: { evidenciaId: e.id, tipo: e.tipo, itemId: e.itemId, erro: mensagem },
      });
    }
  });
}

/**
 * concluirProcessamento devolveu false: ou a evidência foi refeita (linha sumiu, o arquivo sobra) ou outra execução da
 * mesma tarefa já marcou PRONTA com a mesma chave (o arquivo é dela e fica).
 */
async function apagarSeSobrou(db: Db, evidenciaId: string, chave: string, armazenamento: ReturnType<typeof obterArmazenamento>): Promise<void> {
  const [atual] = await db.select({ caminho: evidencias.caminho }).from(evidencias).where(eq(evidencias.id, evidenciaId));
  if (!atual || atual.caminho !== chave) await armazenamento.apagar(chave);
}

/** Tarefa midia.processar-foto: carimbo (extra), SHA-256 final e envio ao armazenamento final. */
export async function processarFoto(db: Db, evidenciaId: string, ctx: ContextoProcessamento): Promise<void> {
  const e = await comecar(db, evidenciaId);
  if (!e) return;
  try {
    const { conteudo } = await carimbarFoto(await readFile(e.caminhoTemporario), {
      quando: e.enviadoEm,
      codigo: e.codigo,
      usuario: e.usuarioNome ?? 'usuário removido',
    });
    const chave = chaveEvidencia(e.devolucaoId, e.id, 'jpg');
    const armazenamento = obterArmazenamento();
    await armazenamento.salvar(chave, Readable.from([conteudo]), { tipoConteudo: 'image/jpeg', tamanho: conteudo.length });
    const ok = await concluirProcessamento(db, e, { chave, tipoConteudo: 'image/jpeg', tamanho: conteudo.length, sha256Final: sha256DoBuffer(conteudo) }, ctx.agora);
    if (!ok) {
      await apagarSeSobrou(db, e.id, chave, armazenamento);
      return;
    }
    // A foto original é descartada depois do carimbo; fica o sha256_original (contrato D6).
    await apagarTemporario(e.caminhoTemporario);
  } catch (erro) {
    await registrarErro(db, e, 'midia.processar-foto', erro, ctx);
    throw erro;
  }
}

/** Tarefa midia.transcodificar (spec §9): H.264 720p; o original só é apagado depois do sucesso. */
export async function transcodificarVideo(
  db: Db,
  evidenciaId: string,
  ctx: ContextoProcessamento,
  binarios: Binarios = binariosFfmpeg(),
): Promise<void> {
  const e = await comecar(db, evidenciaId);
  if (!e) return;
  const saida = `${e.caminhoTemporario}.saida.mp4`;
  try {
    const antes = await sondar(binarios.ffprobe, e.caminhoTemporario);
    await transcodificar(binarios.ffmpeg, e.caminhoTemporario, saida);
    const problema = conferirTranscodificacao(antes, await sondar(binarios.ffprobe, saida));
    if (problema) throw new Error(problema);
    const { size: tamanho } = await stat(saida);
    const sha256Final = await sha256DoArquivo(saida);
    const chave = chaveEvidencia(e.devolucaoId, e.id, 'mp4');
    const armazenamento = obterArmazenamento();
    await armazenamento.salvar(chave, createReadStream(saida), { tipoConteudo: 'video/mp4', tamanho });
    const ok = await concluirProcessamento(db, e, { chave, tipoConteudo: 'video/mp4', tamanho, sha256Final }, ctx.agora);
    await rm(saida, { force: true });
    if (!ok) {
      await apagarSeSobrou(db, e.id, chave, armazenamento);
      return;
    }
    await apagarTemporario(e.caminhoTemporario);
  } catch (erro) {
    await rm(saida, { force: true });
    await registrarErro(db, e, 'midia.transcodificar', erro, ctx);
    throw erro;
  }
}
