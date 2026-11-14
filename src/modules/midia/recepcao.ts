import { and, eq, isNull } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor } from './armazenamento';
import {
  EVIDENCIAS_DO_ITEM,
  LIMITE_FOTO_BYTES,
  LIMITE_VIDEO_BYTES,
  TIPOS_FOTO_ACEITOS,
  ehFoto,
  ehTipoEvidencia,
  type TipoEvidencia,
} from './dominio';
import { apagarTemporario } from './temporarios';

/** Recusa do envio: `status` vira a resposta HTTP do tus; `definitivo` diz ao celular se adianta tentar de novo. */
export class ErroEnvio extends Error {
  readonly status: number;
  readonly definitivo: boolean;

  constructor(status: number, mensagem: string, definitivo = true) {
    super(mensagem);
    this.name = 'ErroEnvio';
    this.status = status;
    this.definitivo = definitivo;
  }
}

export type MetadadosEnvio = {
  idCliente: string;
  devolucaoId: string;
  itemId: string | null;
  tipo: TipoEvidencia;
  tipoConteudo: string;
  nome: string;
};

export function lerMetadados(m: Record<string, string | null> | undefined): MetadadosEnvio | string {
  if (!m) return 'Envio sem identificação.';
  const v = (chave: string) => (m[chave] ?? '').trim();
  const idCliente = v('idCliente');
  const devolucaoId = v('devolucaoId');
  const itemId = v('itemId');
  const tipo = v('tipo');
  const tipoConteudo = v('tipoConteudo').toLowerCase();
  if (!ehUuid(idCliente)) return 'Envio sem identificação.';
  if (!ehUuid(devolucaoId)) return 'Devolução inválida.';
  if (itemId && !ehUuid(itemId)) return 'Unidade inválida.';
  if (!ehTipoEvidencia(tipo)) return 'Tipo de evidência inválido.';
  if (!tipoConteudo) return 'Tipo do arquivo não informado.';
  return { idCliente, devolucaoId, itemId: itemId || null, tipo, tipoConteudo, nome: v('nome').slice(0, 120) || 'arquivo' };
}

/**
 * Quem pode mandar o quê (conferido ao criar o upload e de novo ao registrar):
 * - na conferência, só quem está com a trava (qualquer evidência);
 * - no Recebimento, Fotos 1 e 2 do pacote não identificado (spec §6.2), por quem opera devoluções.
 */
export async function autorizarEnvio(db: DbOuTx, meta: MetadadosEnvio, tamanho: number | undefined, usuario: UsuarioSessao): Promise<void> {
  if (!pode(usuario.perfil, 'operar_devolucoes')) throw new ErroEnvio(403, 'Seu perfil não envia evidências.');
  const foto = ehFoto(meta.tipo);
  if (foto && !TIPOS_FOTO_ACEITOS.includes(meta.tipoConteudo)) {
    throw new ErroEnvio(415, 'A foto precisa ser JPEG, PNG ou WebP. Tire a foto de novo pela câmera.');
  }
  if (!foto && !meta.tipoConteudo.startsWith('video/')) throw new ErroEnvio(415, 'O Vídeo de Prova precisa ser um arquivo de vídeo.');
  if (tamanho === undefined) throw new ErroEnvio(400, 'Tamanho do arquivo não informado.');
  if (tamanho <= 0 || tamanho > (foto ? LIMITE_FOTO_BYTES : LIMITE_VIDEO_BYTES)) {
    throw new ErroEnvio(413, foto ? 'Foto grande demais (máximo 15 MB).' : 'Vídeo grande demais (máximo 300 MB). Grave em 1080p, com até 2 minutos.');
  }
  const daUnidade = (EVIDENCIAS_DO_ITEM as readonly string[]).includes(meta.tipo);
  if (daUnidade && !meta.itemId) throw new ErroEnvio(400, 'Fotos 3 e 4 são de uma unidade: falta dizer qual.');
  if (!daUnidade && meta.tipo !== 'EXTRA' && meta.itemId) throw new ErroEnvio(400, 'Fotos 1 e 2 e o Vídeo de Prova são do pacote, não de uma unidade.');

  const [d] = await db
    .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId, naoIdentificada: devolucoes.naoIdentificada })
    .from(devolucoes)
    .where(eq(devolucoes.id, meta.devolucaoId));
  if (!d) throw new ErroEnvio(404, 'Devolução não encontrada.');
  const naConferencia = d.status === 'EM_CONFERENCIA' && d.conferenteId === usuario.id;
  const noRecebimento =
    d.status === 'AGUARDANDO_CONFERENCIA' && d.naoIdentificada && (meta.tipo === 'FOTO_1_ETIQUETA' || meta.tipo === 'FOTO_2_EMBALAGEM');
  if (!naConferencia && !noRecebimento) throw new ErroEnvio(409, 'A conferência desta devolução não está aberta por você.');
  if (meta.itemId) {
    const [item] = await db
      .select({ id: itensDevolucao.id })
      .from(itensDevolucao)
      .where(and(eq(itensDevolucao.id, meta.itemId), eq(itensDevolucao.devolucaoId, meta.devolucaoId)));
    if (!item) throw new ErroEnvio(400, 'A unidade não é desta devolução.');
  }
}

export type EvidenciaRecebida = {
  meta: MetadadosEnvio;
  /** Caminho absoluto do arquivo do tus (decisão 4). */
  caminhoTemporario: string;
  tamanho: number;
  sha256: string;
  usuario: UsuarioSessao;
  agora?: Date;
};

/**
 * Grava a evidência e enfileira o processamento, numa transação. Idempotente pelo id_cliente: o mesmo envio repetido
 * devolve a evidência que já existe (`repetida`). Refazer (contrato D6): a anterior da mesma vaga é apagada (linha e
 * arquivo), e o evento evidencia_refeita guarda os hashes das duas.
 */
export async function registrarRecebida(db: Db, e: EvidenciaRecebida): Promise<{ evidenciaId: string; repetida: boolean }> {
  const agora = e.agora ?? new Date();
  const [jaExiste] = await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.idCliente, e.meta.idCliente));
  if (jaExiste) return { evidenciaId: jaExiste.id, repetida: true };

  const apagarDepois: { caminho: string | null; provedor: string | null; temporario: string | null }[] = [];
  let resultado: { evidenciaId: string; repetida: boolean };
  try {
    resultado = await db.transaction(async (tx) => {
      // Trava a devolução: dois envios da mesma vaga ao mesmo tempo esperam um pelo outro.
      await tx.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.id, e.meta.devolucaoId)).for('update');
      await autorizarEnvio(tx, e.meta, e.tamanho, e.usuario);
      const [anterior] =
        e.meta.tipo === 'EXTRA'
          ? []
          : await tx
              .select()
              .from(evidencias)
              .where(
                and(
                  eq(evidencias.devolucaoId, e.meta.devolucaoId),
                  eq(evidencias.tipo, e.meta.tipo),
                  e.meta.itemId ? eq(evidencias.itemId, e.meta.itemId) : isNull(evidencias.itemId),
                ),
              );
      if (anterior) {
        await tx.delete(evidencias).where(eq(evidencias.id, anterior.id));
        apagarDepois.push({ caminho: anterior.caminho, provedor: anterior.provedor, temporario: anterior.caminhoTemporario });
      }
      const [nova] = await tx
        .insert(evidencias)
        .values({
          devolucaoId: e.meta.devolucaoId,
          itemId: e.meta.itemId,
          tipo: e.meta.tipo,
          tipoConteudo: e.meta.tipoConteudo,
          caminhoTemporario: e.caminhoTemporario,
          tamanhoOriginal: e.tamanho,
          sha256Original: e.sha256,
          idCliente: e.meta.idCliente,
          enviadoPor: e.usuario.id,
          enviadoEm: agora,
        })
        .returning({ id: evidencias.id });
      const dados = { evidenciaId: nova.id, tipo: e.meta.tipo, itemId: e.meta.itemId, sha256_original: e.sha256 };
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: e.meta.devolucaoId,
        acao: anterior ? 'evidencia_refeita' : 'evidencia_enviada',
        usuarioId: e.usuario.id,
        em: agora,
        dados: anterior
          ? { ...dados, evidenciaAnteriorId: anterior.id, sha256_original_anterior: anterior.sha256Original, sha256_final_anterior: anterior.sha256Final }
          : dados,
      });
      await obterFila().enviar(ehFoto(e.meta.tipo) ? 'midia.processar-foto' : 'midia.transcodificar', { evidenciaId: nova.id }, { tx, chaveUnica: nova.id });
      return { evidenciaId: nova.id, repetida: false };
    });
  } catch (erro) {
    // Dois pedidos de registro do mesmo envio ao mesmo tempo: o segundo encontra o primeiro.
    if (ehViolacaoDeUnicidade(erro)) {
      const [r] = await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.idCliente, e.meta.idCliente));
      if (r) return { evidenciaId: r.id, repetida: true };
    }
    throw erro;
  }
  for (const a of apagarDepois) {
    if (a.caminho && a.provedor) await armazenamentoDoProvedor(a.provedor).apagar(a.caminho).catch(() => undefined);
    if (a.temporario) await apagarTemporario(a.temporario);
  }
  return resultado;
}
