import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { asc, eq } from 'drizzle-orm';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ErroReclamacaoSemDevolucao } from '@/conectores/marketplace/mercadolivre/conector';
import type { ConectorMercadoLivre, DadosDevolucaoML, ReclamacaoAtualizada } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DevolucaoExterna, ResultadoConferencia } from '@/conectores/marketplace/tipos';
import type { TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import { criarDevolucao, type DadosNovaDevolucao } from '@/modules/devolucoes/criar';
import type { MotivoItem } from '@/modules/devolucoes/dominio';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { dadosCanal } from '@/modules/mercado-livre/sincronizar';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { ConfigML } from '@/modules/mercado-livre/config';
import { conectarConta } from '@/modules/mercado-livre/contas';
import { criarUsuarioTeste } from './fabricas';

/** Fábricas da Fase 3 (contrato §3: cada fase tem as suas; fabricas.ts fica congelado). */
export const VENDEDOR_TESTE = '123456789';
const CHAVE_TESTE = Buffer.alloc(32, 7).toString('base64');

export function configMLTeste(mudancas: Partial<ConfigML> = {}): ConfigML {
  return {
    modo: 'falso',
    clientId: 'APP-TESTE',
    clientSecret: 'SEGREDO-TESTE',
    redirectUri: 'http://localhost/api/ml/retorno',
    usarPkce: false,
    chaveBase64: CHAVE_TESTE,
    ...mudancas,
  };
}

export function tokensTeste(mudancas: Partial<TokensML> = {}): TokensML {
  return {
    accessToken: 'APP_USR-FALSO-TESTE',
    refreshToken: 'TG-FALSO-TESTE',
    expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    userId: Number(VENDEDOR_TESTE),
    escopo: 'offline_access read write',
    ...mudancas,
  };
}

export async function contaMLTeste(
  db: DbOuTx,
  p: { config?: ConfigML; tokens?: TokensML; gestor?: UsuarioSessao } = {},
): Promise<{ contaId: string; gestor: UsuarioSessao }> {
  const gestor = p.gestor ?? (await criarUsuarioTeste(db, 'GESTOR'));
  const { contaId } = await conectarConta(db, p.tokens ?? tokensTeste(), gestor, p.config ?? configMLTeste(), new Date());
  return { contaId, gestor };
}

let sequencia = 0;
function marca(): string {
  sequencia += 1;
  return `${Date.now().toString(36).toUpperCase()}${sequencia}`;
}

export function devolucaoExternaTeste(m: Partial<DevolucaoExterna> = {}): DevolucaoExterna {
  const id = marca();
  const pedido = `PED-ML-${id}`;
  return {
    canal: 'MERCADO_LIVRE',
    devolucaoExternaId: `RET-${id}`,
    reclamacaoId: `CLM-${id}`,
    tipo: 'DEVOLUCAO',
    semEnvioFisico: false,
    pedidos: [pedido],
    statusCanal: 'shipped/shipped',
    destinoEnvio: 'VENDEDOR',
    reenvioDaTriagem: false,
    rastreio: `ML${id}BR`,
    transportadora: 'Correios',
    entregueEm: null,
    prazoConferencia: new Date(Date.now() + 3 * 86_400_000),
    atualizadaEm: new Date(),
    itens: [{ pedido, sku: 'SKU-ML-1', ean: null, quantidade: 1 }],
    ...m,
  };
}

export function dadosDevolucaoMLTeste(
  devolucao: DevolucaoExterna | null,
  extra: Partial<Omit<DadosDevolucaoML, 'devolucao'>> = {},
): DadosDevolucaoML {
  return {
    reclamacaoId: devolucao?.reclamacaoId ?? `CLM-${marca()}`,
    statusReclamacao: 'opened',
    subtipo: devolucao === null ? null : devolucao.semEnvioFisico ? 'low_cost' : 'return_total',
    statusDevolucao: devolucao ? devolucao.statusCanal.split('/')[0] : null,
    atualizadaEm: new Date(),
    devolucao,
    ...extra,
  };
}

/** Conector do ML em memória para os testes de integração (o falso de src/ troca o fetch; este troca o conector inteiro). */
export class ConectorMLMemoria implements ConectorMercadoLivre {
  readonly canal = 'MERCADO_LIVRE' as const;
  readonly sellerId = VENDEDOR_TESTE;
  readonly reclamacoes = new Map<string, DadosDevolucaoML>();
  readonly enviados: { devolucaoExternaId: string; resultado: ResultadoConferencia }[] = [];
  readonly buscas: Date[] = [];
  falhaNoEnvio: unknown = null;

  guardar(dados: DadosDevolucaoML): this {
    this.reclamacoes.set(dados.reclamacaoId, dados);
    return this;
  }

  async obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML> {
    const dados = this.reclamacoes.get(reclamacaoId);
    if (!dados) throw new ErroML(404, '{"message":"not_found"}', `/post-purchase/v1/claims/${reclamacaoId}`);
    return dados;
  }

  async obter(reclamacaoId: string): Promise<DevolucaoExterna> {
    const dados = await this.obterReclamacao(reclamacaoId);
    if (!dados.devolucao) throw new ErroReclamacaoSemDevolucao(reclamacaoId);
    return dados.devolucao;
  }

  async *reclamacoesAtualizadasDesde(desde: Date): AsyncGenerator<ReclamacaoAtualizada> {
    this.buscas.push(desde);
    for (const dados of this.reclamacoes.values()) yield { reclamacaoId: dados.reclamacaoId, atualizadaEm: dados.atualizadaEm };
  }

  async *listarAtualizadasDesde(desde: Date): AsyncGenerator<DevolucaoExterna> {
    for await (const r of this.reclamacoesAtualizadasDesde(desde)) {
      const dados = this.reclamacoes.get(r.reclamacaoId);
      if (dados?.devolucao) yield dados.devolucao;
    }
  }

  async enviarResultadoConferencia(devolucaoExternaId: string, resultado: ResultadoConferencia): Promise<void> {
    if (this.falhaNoEnvio) throw this.falhaNoEnvio;
    this.enviados.push({ devolucaoExternaId, resultado });
  }

  async obterXmlNotaVenda(): Promise<string | null> {
    return null;
  }
}

export type ItemConferenciaTeste = { sku?: string; destino: 'BOM' | 'PROBLEMA' | null; motivo?: MotivoItem | null; observacao?: string | null };

/**
 * Devolução do ML no estado do fim da conferência (contrato §5.6), gravado direto nas colunas da P2:
 * - BOM ou PROBLEMA: o item vai a AGUARDANDO_NF, com o destino (e o motivo, no PROBLEMA);
 * - `destino: null`: o item fica AUSENTE, com motivo AUSENTE.
 * A devolução vai a AGUARDANDO_NF, ou a CONCLUIDA se todos os itens forem AUSENTE.
 * `externa: null` = cadastro manual do ML, sem vínculo.
 */
export async function devolucaoMLConferidaTeste(
  db: DbOuTx,
  p: { itens: ItemConferenciaTeste[]; externa?: Partial<DevolucaoExterna> | null; usuario?: UsuarioSessao },
): Promise<{ id: string; codigo: string; itens: { id: string; unidade: number }[]; externa: DevolucaoExterna | null }> {
  const externa = p.externa === null ? null : devolucaoExternaTeste({ itens: [], ...p.externa });
  const dados: DadosNovaDevolucao = {
    canal: 'MERCADO_LIVRE',
    pedido: externa?.pedidos[0] ?? `PED-MANUAL-${marca()}`,
    reclamacaoId: externa?.reclamacaoId ?? null,
    rastreio: externa?.rastreio ?? null,
    transportadora: 'Correios',
    motivoCliente: null,
    postadaEm: null,
    itens: p.itens.map((item, i) => ({ sku: item.sku ?? `SKU-ML-${i + 1}`, quantidade: 1 })),
  };
  const criada = externa
    ? await criarDevolucao(db, dados, { origem: 'API', usuario: null, canal: dadosCanal(externa) })
    : await criarDevolucao(db, dados, { origem: 'MANUAL', usuario: p.usuario ?? (await criarUsuarioTeste(db, 'OPERADOR')) });
  const itens = await db
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  for (const [i, item] of itens.entries()) {
    const c = p.itens[i];
    const ausente = c.destino === null;
    await db
      .update(itensDevolucao)
      .set({
        status: ausente ? 'AUSENTE' : 'AGUARDANDO_NF',
        destino: c.destino,
        motivo: ausente ? 'AUSENTE' : c.destino === 'PROBLEMA' ? (c.motivo ?? 'OUTRO') : null,
        observacao: c.observacao ?? null,
      })
      .where(eq(itensDevolucao.id, item.id));
  }
  const todosAusentes = p.itens.every((i) => i.destino === null);
  const agora = new Date();
  await db
    .update(devolucoes)
    .set({ status: todosAusentes ? 'CONCLUIDA' : 'AGUARDANDO_NF', conferidaEm: agora, ...(todosAusentes ? { concluidaEm: agora } : {}) })
    .where(eq(devolucoes.id, criada.id));
  return { id: criada.id, codigo: criada.codigo, itens, externa };
}

type TipoEvidenciaTeste = 'FOTO_1_ETIQUETA' | 'FOTO_2_EMBALAGEM' | 'FOTO_3_PRODUTO' | 'FOTO_4_CODIGO_SERIAL' | 'VIDEO_PROVA' | 'EXTRA';

/** Evidência gravada como a Fase 2 deixaria. PRONTA = arquivo salvo no armazenamento (o de memória, nos testes de integração). */
export async function fotoTeste(
  db: DbOuTx,
  p: { devolucaoId: string; tipo: TipoEvidenciaTeste; itemId?: string | null; situacao?: 'RECEBIDA' | 'PROCESSANDO' | 'PRONTA' | 'FALHOU'; conteudo?: Buffer },
): Promise<{ id: string; conteudo: Buffer }> {
  const id = randomUUID();
  const video = p.tipo === 'VIDEO_PROVA';
  const tipoConteudo = video ? 'video/mp4' : 'image/jpeg';
  const conteudo = p.conteudo ?? Buffer.from(`evidencia-de-teste-${id}`);
  const situacao = p.situacao ?? 'PRONTA';
  const pronta = situacao === 'PRONTA';
  const caminho = `evidencias/${p.devolucaoId}/${id}.${video ? 'mp4' : 'jpg'}`;
  if (pronta) await obterArmazenamento().salvar(caminho, Readable.from([conteudo]), { tipoConteudo, tamanho: conteudo.length });
  const sha = createHash('sha256').update(conteudo).digest('hex');
  await db.insert(evidencias).values({
    id,
    devolucaoId: p.devolucaoId,
    itemId: p.itemId ?? null,
    tipo: p.tipo,
    tipoConteudo,
    caminho: pronta ? caminho : null,
    provedor: pronta ? 'disco' : null,
    tamanhoOriginal: conteudo.length,
    tamanho: pronta ? conteudo.length : null,
    sha256Original: sha,
    sha256Final: pronta ? sha : null,
    situacaoProcessamento: situacao,
    idCliente: randomUUID(),
    processadoEm: pronta ? new Date() : null,
  });
  return { id, conteudo };
}
