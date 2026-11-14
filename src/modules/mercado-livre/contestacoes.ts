import { and, asc, count, eq, inArray, isNull, like, notInArray, sql } from 'drizzle-orm';
import { ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML, mensagemErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, evidencias, itensDevolucao, usuarios } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosSelo } from '@/modules/devolucoes/selos';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor, provedorAtual } from '@/modules/midia/armazenamento';
import { ehTipoEvidencia, ROTULO_EVIDENCIA } from '@/modules/midia/dominio';
import { obterConectorML } from './conector';
import { ErroContaML } from './contas';
import { ehMotivoCanal, MOTIVOS_COM_FOTO_OBRIGATORIA, ROTULO_MOTIVO_CANAL, type StatusContestacao } from './dominio';
import { LIMITE_MENSAGEM, MAX_FOTOS_CONTESTACAO, TEXTO_MOTIVO_ITEM, TIPOS_FOTO_CONTESTACAO } from './resultado';
import { seloPrazoML } from './selos';

/** Spec §7.4: JPG de até 5 MB. */
export const LIMITE_FOTO_ML_BYTES = 5 * 1024 * 1024;

export class ErroContestacao extends Error {
  readonly erros: string[];

  constructor(erros: string[]) {
    super(erros.join(' '));
    this.name = 'ErroContestacao';
    this.erros = erros;
  }
}

/** Nomes do PDF (spec §6.3). */
/** Os nomes do PDF vêm da Parte A (`ROTULO_EVIDENCIA`; contrato §4.5 e §10, E2). */
export function rotuloFoto(tipo: string, unidade: number | null): string {
  const nome = ehTipoEvidencia(tipo) ? ROTULO_EVIDENCIA[tipo] : tipo;
  return unidade === null ? nome : `${nome} · unidade ${unidade}`;
}

function motivoValido(texto: string): MotivoCanal {
  return ehMotivoCanal(texto) ? texto : 'SRF6';
}

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type CartaoContestacao = {
  id: string;
  devolucaoId: string;
  codigo: string;
  motivo: MotivoCanal;
  status: StatusContestacao;
  enviando: boolean;
  prazo: Date | null;
  selo: DadosSelo | null;
  fotos: number;
  erro: string | null;
};

export async function listarContestacoes(db: DbOuTx, status: StatusContestacao, agora: Date = new Date()): Promise<CartaoContestacao[]> {
  const linhas = await db
    .select({
      id: contestacoesCanal.id,
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      motivo: contestacoesCanal.motivoCanal,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      prazo: contestacoesCanal.prazo,
      evidencias: contestacoesCanal.evidencias,
      erro: contestacoesCanal.erro,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .where(eq(contestacoesCanal.status, status))
    .orderBy(sql`${contestacoesCanal.prazo} asc nulls last`, asc(contestacoesCanal.criadaEm))
    .limit(200);
  return linhas.map((l) => ({
    id: l.id,
    devolucaoId: l.devolucaoId,
    codigo: l.codigo,
    motivo: motivoValido(l.motivo),
    status: l.status,
    enviando: l.status === 'AGUARDANDO_GESTOR' && l.revisadoPor !== null,
    prazo: l.prazo,
    selo: l.status === 'ENVIADA' ? null : seloPrazoML(l.prazo, agora),
    fotos: l.evidencias.length,
    erro: l.erro,
  }));
}

export async function contarContestacoes(db: DbOuTx): Promise<Record<StatusContestacao, number>> {
  const linhas = await db.select({ status: contestacoesCanal.status, total: count() }).from(contestacoesCanal).groupBy(contestacoesCanal.status);
  const contagem: Record<StatusContestacao, number> = { AGUARDANDO_GESTOR: 0, ENVIADA: 0, FALHOU: 0 };
  for (const l of linhas) contagem[l.status] = Number(l.total);
  return contagem;
}

/** Fotos que podem ir ao ML (spec §6.6: o Gestor revisa as fotos). As que falharam ou foram apagadas não entram. */
async function fotosDaDevolucao(db: DbOuTx, devolucaoId: string) {
  return db
    .select({
      id: evidencias.id,
      tipo: evidencias.tipo,
      caminho: evidencias.caminho,
      provedor: evidencias.provedor,
      situacao: evidencias.situacaoProcessamento,
      unidade: itensDevolucao.unidade,
    })
    .from(evidencias)
    .leftJoin(itensDevolucao, eq(itensDevolucao.id, evidencias.itemId))
    .where(
      and(
        eq(evidencias.devolucaoId, devolucaoId),
        inArray(evidencias.tipo, [...TIPOS_FOTO_CONTESTACAO]),
        like(evidencias.tipoConteudo, 'image/%'),
        notInArray(evidencias.situacaoProcessamento, ['FALHOU', 'APAGADA']),
      ),
    )
    .orderBy(asc(evidencias.tipo), asc(itensDevolucao.unidade), asc(evidencias.enviadoEm));
}

/** `provedor`: onde o arquivo está (disco ou s3); o link usa armazenamentoDoProvedor (contrato §10, E15). */
export type FotoCandidata = { id: string; tipo: string; rotulo: string; caminho: string | null; provedor: string | null; selecionada: boolean };

export type DetalheContestacao = {
  id: string;
  devolucaoId: string;
  codigo: string;
  pedidos: string[];
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  motivo: MotivoCanal;
  mensagem: string;
  status: StatusContestacao;
  enviando: boolean;
  prazo: Date | null;
  selo: DadosSelo | null;
  erro: string | null;
  revisadoPorNome: string | null;
  enviadaEm: Date | null;
  itensProblema: { unidade: number; sku: string; motivoTexto: string; observacao: string | null }[];
  fotos: FotoCandidata[];
};

export async function obterContestacao(db: DbOuTx, id: string, agora: Date = new Date()): Promise<DetalheContestacao | null> {
  if (!ehUuid(id)) return null;
  const [c] = await db
    .select({
      id: contestacoesCanal.id,
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: devolucoes.reclamacaoId,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      motivo: contestacoesCanal.motivoCanal,
      mensagem: contestacoesCanal.mensagem,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      revisadoPorNome: usuarios.nome,
      prazo: contestacoesCanal.prazo,
      erro: contestacoesCanal.erro,
      enviadaEm: contestacoesCanal.enviadaEm,
      evidencias: contestacoesCanal.evidencias,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .leftJoin(usuarios, eq(usuarios.id, contestacoesCanal.revisadoPor))
    .where(eq(contestacoesCanal.id, id));
  if (!c) return null;
  const itens = await db
    .select({
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, c.devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
  const fotos = await fotosDaDevolucao(db, c.devolucaoId);
  return {
    id: c.id,
    devolucaoId: c.devolucaoId,
    codigo: c.codigo,
    pedidos: c.pedidos,
    reclamacaoId: c.reclamacaoId,
    devolucaoExternaId: c.devolucaoExternaId,
    motivo: motivoValido(c.motivo),
    mensagem: c.mensagem,
    status: c.status,
    enviando: c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor !== null,
    prazo: c.prazo,
    selo: c.status === 'ENVIADA' ? null : seloPrazoML(c.prazo, agora),
    erro: c.erro,
    revisadoPorNome: c.revisadoPorNome,
    enviadaEm: c.enviadaEm,
    itensProblema: itens
      .filter((i) => i.status === 'AUSENTE' || i.destino === 'PROBLEMA')
      .map((i) => ({
        unidade: i.unidade,
        sku: i.sku,
        motivoTexto: comMaiuscula(TEXTO_MOTIVO_ITEM[i.status === 'AUSENTE' ? 'AUSENTE' : (i.motivo ?? 'OUTRO')]),
        observacao: i.observacao,
      })),
    fotos: fotos.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      rotulo: rotuloFoto(f.tipo, f.unidade),
      caminho: f.situacao === 'PRONTA' ? f.caminho : null,
      provedor: f.provedor,
      selecionada: c.evidencias.includes(f.id),
    })),
  };
}

export type EntradaRevisao = { motivo: string; mensagem: string; evidencias: string[] };
export type RevisaoValida = { motivo: MotivoCanal; mensagem: string; evidencias: string[] };

export function validarRevisao(e: EntradaRevisao, fotosPermitidas: ReadonlySet<string>): { dados: RevisaoValida | null; erros: string[] } {
  const erros: string[] = [];
  const motivo = e.motivo.trim();
  if (!ehMotivoCanal(motivo)) erros.push('Escolha o motivo para o Mercado Livre.');
  const mensagem = e.mensagem.trim();
  if (mensagem.length < 10) erros.push('Escreva a mensagem para o Mercado Livre (pelo menos 10 letras).');
  if (mensagem.length > LIMITE_MENSAGEM) erros.push(`Mensagem: no máximo ${LIMITE_MENSAGEM} caracteres.`);
  const fotos = [...new Set(e.evidencias)];
  if (fotos.some((f) => !fotosPermitidas.has(f))) erros.push('Uma das fotos escolhidas não é desta devolução.');
  if (fotos.length > MAX_FOTOS_CONTESTACAO) erros.push(`Escolha no máximo ${MAX_FOTOS_CONTESTACAO} fotos.`);
  if (ehMotivoCanal(motivo) && MOTIVOS_COM_FOTO_OBRIGATORIA.includes(motivo) && fotos.length === 0) {
    erros.push(`O motivo "${ROTULO_MOTIVO_CANAL[motivo]}" exige pelo menos 1 foto.`);
  }
  if (erros.length > 0 || !ehMotivoCanal(motivo)) return { dados: null, erros };
  return { dados: { motivo, mensagem, evidencias: fotos }, erros: [] };
}

/**
 * O Gestor revisa (motivo, mensagem e fotos, D8) e pede o envio (spec §6.6). Vale de AGUARDANDO_GESTOR sem envio pedido
 * e de FALHOU. Na mesma transação: grava, registra e enfileira ml.enviar-contestacao.
 */
export async function revisarEEnviar(db: DbOuTx, fila: Fila, id: string, e: EntradaRevisao, usuario: UsuarioSessao, agora: Date): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContestacao(['Só o Gestor envia contestações ao Mercado Livre.']);
  if (!ehUuid(id)) throw new ErroContestacao(['Contestação não encontrada.']);
  const [c] = await db
    .select({ status: contestacoesCanal.status, revisadoPor: contestacoesCanal.revisadoPor, devolucaoId: contestacoesCanal.devolucaoId })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.id, id));
  if (!c) throw new ErroContestacao(['Contestação não encontrada.']);
  if (c.status === 'ENVIADA') throw new ErroContestacao(['Esta contestação já foi enviada ao Mercado Livre.']);
  if (c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor) throw new ErroContestacao(['O envio já foi pedido. Aguarde o resultado.']);
  const permitidas = new Set((await fotosDaDevolucao(db, c.devolucaoId)).map((f) => f.id));
  const { dados, erros } = validarRevisao(e, permitidas);
  if (!dados) throw new ErroContestacao(erros);
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contestacoesCanal)
      .set({
        motivoCanal: dados.motivo,
        mensagem: dados.mensagem,
        evidencias: dados.evidencias,
        status: 'AGUARDANDO_GESTOR',
        revisadoPor: usuario.id,
        erro: null,
        atualizadaEm: agora,
      })
      .where(
        and(
          eq(contestacoesCanal.id, id),
          eq(contestacoesCanal.status, c.status),
          c.status === 'AGUARDANDO_GESTOR' ? isNull(contestacoesCanal.revisadoPor) : undefined,
        ),
      )
      .returning({ id: contestacoesCanal.id });
    if (!mudou) throw new ErroContestacao(['O envio já foi pedido. Aguarde o resultado.']);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'contestacao_revisada',
      usuarioId: usuario.id,
      dados: { contestacaoId: id, motivo: dados.motivo, fotos: dados.evidencias.length, statusAnterior: c.status },
      em: agora,
    });
    // Uma chave por pedido de envio: depois de FALHOU o Gestor pode mandar de novo, e a chave antiga já foi usada
    // (o id do job é fixo; contrato §10, E4). O `where` acima já impede dois pedidos ao mesmo tempo.
    await fila.enviar('ml.enviar-contestacao', { contestacaoId: id }, { tx, chaveUnica: `ml-contestacao-${id}-${agora.getTime()}` });
  });
}

/** Lê a foto de onde ela foi gravada (coluna `provedor`): depois da troca disco → S3 as antigas continuam no disco (D2, E15). */
async function lerArquivo(foto: { caminho: string; provedor: string | null }): Promise<Buffer> {
  const partes: Buffer[] = [];
  const origem = armazenamentoDoProvedor(foto.provedor ?? provedorAtual());
  for await (const parte of await origem.ler(foto.caminho)) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
  return Buffer.concat(partes);
}

export type ResultadoEnvio = 'enviada' | 'falhou' | 'ignorada';

/**
 * Tarefa ml.enviar-contestacao. Espera as fotos ficarem PRONTA (contrato §5.4), lê os arquivos e envia (spec §7.4).
 * Recusa definitiva do ML → FALHOU com o motivo. Erro passageiro → lança (nova tentativa); na última tentativa → FALHOU
 * (decisão 9 do plano).
 */
export async function enviarContestacao(db: DbOuTx, id: string, o: { agora: Date; ultimaTentativa: boolean }): Promise<ResultadoEnvio> {
  if (!ehUuid(id)) return 'ignorada';
  const [c] = await db
    .select({
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      motivo: contestacoesCanal.motivoCanal,
      mensagem: contestacoesCanal.mensagem,
      evidencias: contestacoesCanal.evidencias,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      reclamacaoId: devolucoes.reclamacaoId,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .where(eq(contestacoesCanal.id, id));
  if (!c || c.status !== 'AGUARDANDO_GESTOR' || !c.revisadoPor) return 'ignorada';

  const falhar = async (mensagem: string): Promise<ResultadoEnvio> => {
    await db.transaction(async (tx) => {
      await tx.update(contestacoesCanal).set({ status: 'FALHOU', erro: mensagem, atualizadaEm: o.agora }).where(eq(contestacoesCanal.id, id));
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: c.devolucaoId,
        acao: 'contestacao_falhou',
        usuarioId: null,
        dados: { contestacaoId: id, erro: mensagem },
        em: o.agora,
      });
    });
    return 'falhou';
  };
  const tentarDepois = async (mensagem: string, erro: unknown): Promise<ResultadoEnvio> => {
    if (o.ultimaTentativa) return falhar(mensagem);
    throw erro;
  };

  if (!c.devolucaoExternaId || !c.reclamacaoId) return falhar('A devolução não está ligada a uma devolução do Mercado Livre.');
  const motivo = motivoValido(c.motivo);
  const fotos =
    c.evidencias.length === 0
      ? []
      : await db
          .select({ id: evidencias.id, caminho: evidencias.caminho, provedor: evidencias.provedor, situacao: evidencias.situacaoProcessamento })
          .from(evidencias)
          .where(inArray(evidencias.id, c.evidencias));
  if (fotos.some((f) => f.situacao === 'RECEBIDA' || f.situacao === 'PROCESSANDO')) {
    return tentarDepois(
      'As fotos ainda estavam sendo processadas. Revise e envie de novo em alguns minutos.',
      new ErroContestacao(['Fotos ainda em processamento.']),
    );
  }
  const anexos: { nome: string; conteudo: Buffer; tipoConteudo: 'image/jpeg' }[] = [];
  for (const evidenciaId of c.evidencias) {
    const foto = fotos.find((f) => f.id === evidenciaId);
    if (!foto || foto.situacao !== 'PRONTA' || !foto.caminho) continue;
    const conteudo = await lerArquivo({ caminho: foto.caminho, provedor: foto.provedor });
    if (conteudo.length > LIMITE_FOTO_ML_BYTES) continue;
    anexos.push({ nome: `${c.codigo}-${anexos.length + 1}.jpg`, conteudo, tipoConteudo: 'image/jpeg' });
  }
  if (MOTIVOS_COM_FOTO_OBRIGATORIA.includes(motivo) && anexos.length === 0) {
    return falhar(`Nenhuma foto pôde ser enviada, e o motivo "${ROTULO_MOTIVO_CANAL[motivo]}" exige foto. Escolha as fotos e envie de novo.`);
  }
  const conector = await obterConectorML(db);
  if (!conector) {
    return tentarDepois(
      'A conta do Mercado Livre não está conectada. Conecte em Configurações › Mercado Livre e envie de novo.',
      new ErroContaML('Conta do Mercado Livre não conectada.'),
    );
  }
  try {
    await conector.enviarResultadoConferencia(c.devolucaoExternaId, { tipo: 'PROBLEMA', reclamacaoId: c.reclamacaoId, motivo, mensagem: c.mensagem, anexos });
  } catch (erro) {
    if (erro instanceof ErroMotivoIndisponivel) return falhar(erro.message);
    logErroML('enviar contestação', erro, { contestacaoId: id });
    if (ehRecusaDefinitiva(erro)) return falhar(`O Mercado Livre recusou o envio: ${mensagemErroML(erro)}`);
    return tentarDepois('O Mercado Livre não respondeu depois de várias tentativas. Envie de novo mais tarde.', erro);
  }
  await db.transaction(async (tx) => {
    await tx.update(contestacoesCanal).set({ status: 'ENVIADA', enviadaEm: o.agora, erro: null, atualizadaEm: o.agora }).where(eq(contestacoesCanal.id, id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'contestacao_enviada',
      usuarioId: c.revisadoPor,
      dados: { contestacaoId: id, motivo, fotos: anexos.length },
      em: o.agora,
    });
  });
  return 'enviada';
}
