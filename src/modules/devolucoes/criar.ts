import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { interpretarData, interpretarInteiro, textoOpcional } from '@/lib/valores';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import { interpretarCanal } from './canais';
import {
  CANAIS,
  LIMITE_QUANTIDADE,
  LIMITE_UNIDADES_DEVOLUCAO,
  ROTULO_CANAL,
  type Canal,
  type StatusDevolucao,
  type TipoDevolucao,
} from './dominio';
import { ErroDevolucao, ErroDevolucaoDuplicada } from './erros';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';

/**
 * Uma devolução Cancelada, Extraviada ou Concluída não impede outra para o mesmo pedido. Concluída conta como encerrada porque
 * uma nova devolução do mesmo pedido depois de uma concluída é legítima (novo retorno do cliente). Se o cancelamento de uma NF
 * reabrir uma Concluída (spec §5.2), um duplicado pode existir: aceito como raro e corrigível à mão (junto com a regra PF7 abaixo).
 */
const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];

export type ItemPedido = { sku: string; quantidade: number };

/** Entrada como chega do formulário ou da planilha (tudo texto). */
export type EntradaNovaDevolucao = {
  canal: string;
  pedido: string;
  reclamacaoId?: string;
  rastreio?: string;
  transportadora?: string;
  motivoCliente?: string;
  postadaEm?: string;
  itens: { sku: string; quantidade: string | number }[];
};

export type DadosNovaDevolucao = {
  canal: Canal;
  pedido: string;
  reclamacaoId: string | null;
  rastreio: string | null;
  transportadora: string | null;
  motivoCliente: string | null;
  postadaEm: string | null;
  itens: ItemPedido[];
};

export type DevolucaoCriada = { id: string; codigo: string; unidades: number };

/** "A, B ou C" com os nomes de tela dos canais aceitos. */
function listaDeCanais(): string {
  const nomes = CANAIS.map((c) => ROTULO_CANAL[c]);
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}

export function mensagemLimiteUnidades(total: number): string {
  return `Uma devolução aceita no máximo ${LIMITE_UNIDADES_DEVOLUCAO} unidades no total (foram informadas ${total}). Divida em mais de uma devolução.`;
}

export function mensagemRastreioNaoIdentificado(codigo: string): string {
  return `Este rastreio é do pacote não identificado ${codigo}. Identifique esse pacote em vez de criar outra devolução.`;
}

/**
 * Código do pacote não identificado ATIVO (não cancelado, extraviado nem concluído) de cada rastreio, na chave do próprio rastreio.
 * `exceto`: id de um pacote que não conta (o que está sendo identificado).
 */
export async function codigosNaoIdentificadosPorRastreio(db: DbOuTx, rastreios: string[], exceto?: string): Promise<Map<string, string>> {
  const lista = [...new Set(rastreios.filter((r) => r !== ''))];
  if (lista.length === 0) return new Map();
  const linhas = await db
    .select({ rastreio: devolucoes.rastreio, codigo: devolucoes.codigo })
    .from(devolucoes)
    .where(
      and(
        eq(devolucoes.naoIdentificada, true),
        inArray(devolucoes.rastreio, lista),
        notInArray(devolucoes.status, ENCERRADAS),
        exceto ? ne(devolucoes.id, exceto) : undefined,
      ),
    )
    .orderBy(asc(devolucoes.numero));
  const resultado = new Map<string, string>();
  for (const l of linhas) if (l.rastreio && !resultado.has(l.rastreio)) resultado.set(l.rastreio, l.codigo);
  return resultado;
}

/** Campos do formulário "Nova devolução" (spec §6.1) e das colunas da planilha de devoluções. */
export function validarNovaDevolucao(
  e: EntradaNovaDevolucao,
  opcoes: { exigirItens?: boolean } = {},
): { dados: DadosNovaDevolucao | null; erros: string[] } {
  const erros: string[] = [];
  const canalTexto = e.canal.trim();
  const canal = canalTexto ? interpretarCanal(canalTexto) : null;
  if (!canalTexto) erros.push('Escolha o canal (marketplace)');
  else if (!canal) erros.push(`Canal desconhecido: ${canalTexto}. Use: ${listaDeCanais()}.`);
  const pedido = e.pedido.trim();
  if (!pedido) erros.push('Informe o número do pedido');
  else if (pedido.length > 60) erros.push('Número do pedido: no máximo 60 caracteres');
  const reclamacaoId = textoOpcional(e.reclamacaoId, 60, 'ID da reclamação', erros);
  const rastreio = normalizarRastreio(e.rastreio ?? '') || null;
  if (rastreio && rastreio.length > 60) erros.push('Código de rastreamento: no máximo 60 caracteres');
  const transportadora = textoOpcional(e.transportadora, 60, 'Transportadora', erros);
  const motivoCliente = textoOpcional(e.motivoCliente, 500, 'Motivo do cliente', erros);
  const postagemTexto = (e.postadaEm ?? '').trim();
  const postadaEm = postagemTexto ? interpretarData(postagemTexto) : null;
  if (postagemTexto && !postadaEm) erros.push(`Data de postagem inválida: ${postagemTexto}`);

  const itens: ItemPedido[] = [];
  e.itens.forEach((item, i) => {
    const qual = e.itens.length > 1 ? ` (item ${i + 1})` : '';
    const sku = normalizarSku(item.sku);
    if (!sku) {
      erros.push(`Informe o SKU${qual}`);
      return;
    }
    if (sku.length > 60) {
      erros.push(`SKU${qual}: no máximo 60 caracteres`);
      return;
    }
    const quantidade = interpretarInteiro(String(item.quantidade).trim() || '1');
    if (quantidade === null || quantidade < 1 || quantidade > LIMITE_QUANTIDADE) {
      erros.push(`Quantidade inválida${qual}: use um número de 1 a ${LIMITE_QUANTIDADE}`);
      return;
    }
    itens.push({ sku, quantidade });
  });
  const total = itens.reduce((soma, item) => soma + item.quantidade, 0);
  if (total > LIMITE_UNIDADES_DEVOLUCAO) erros.push(mensagemLimiteUnidades(total));
  if ((opcoes.exigirItens ?? true) && e.itens.length === 0) erros.push('Informe pelo menos um item (SKU e quantidade)');

  if (erros.length > 0 || !canal) return { dados: null, erros };
  return { dados: { canal, pedido, reclamacaoId, rastreio, transportadora, motivoCliente, postadaEm, itens }, erros: [] };
}

/** Uma linha por unidade física (spec §5.1): 2 × A e 1 × B viram [A, A, B]. */
export function expandirUnidades(itens: ItemPedido[]): string[] {
  return itens.flatMap((item) => Array.from({ length: item.quantidade }, () => item.sku));
}

/** Pares "sku" + "quantidade" repetidos no formulário, na mesma ordem. Linhas sem SKU são ignoradas. */
export function itensDoFormulario(dados: FormData): { sku: string; quantidade: string }[] {
  const skus = dados.getAll('sku').map(String);
  const quantidades = dados.getAll('quantidade').map(String);
  return skus.map((sku, i) => ({ sku, quantidade: quantidades[i] ?? '' })).filter((item) => item.sku.trim() !== '');
}

export function chavePedido(canal: Canal, pedido: string): string {
  return `${canal}|${pedido}`;
}

/** Código da devolução em andamento de cada (canal, pedido) pedido, na chave `chavePedido(canal, pedido)`. */
export async function codigosAtivosPorPedido(db: DbOuTx, pares: { canal: Canal; pedido: string }[]): Promise<Map<string, string>> {
  if (pares.length === 0) return new Map();
  const canais = [...new Set(pares.map((p) => p.canal))];
  const pedidos = [...new Set(pares.map((p) => p.pedido))];
  const linhas = await db
    .select({ canal: devolucoes.canal, pedidos: devolucoes.pedidosExternos, codigo: devolucoes.codigo })
    .from(devolucoes)
    .where(
      and(
        inArray(devolucoes.canal, canais),
        notInArray(devolucoes.status, ENCERRADAS),
        sql`${devolucoes.pedidosExternos} && ARRAY[${sql.join(
          pedidos.map((p) => sql`${p}`),
          sql`, `,
        )}]::text[]`,
      ),
    )
    .orderBy(asc(devolucoes.numero));
  const procurados = new Set(pares.map((p) => chavePedido(p.canal, p.pedido)));
  const resultado = new Map<string, string>();
  for (const linha of linhas) {
    if (!linha.canal) continue;
    for (const pedido of linha.pedidos) {
      const chave = chavePedido(linha.canal, pedido);
      if (procurados.has(chave) && !resultado.has(chave)) resultado.set(chave, linha.codigo);
    }
  }
  return resultado;
}

/** Dados que só a criação pela API do canal tem (contrato §5.5). */
export type DadosCanal = {
  devolucaoExternaId: string;
  tipo: TipoDevolucao;
  pedidos: string[];
  statusCanal: string;
  entregueSegundoCanalEm: Date | null;
  prazoConferenciaCanal: Date | null;
};

export type OpcoesCriacao =
  | { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao }
  | { origem: 'API'; usuario: null; canal: DadosCanal; agora?: Date };

/**
 * Cadastra a devolução em "Pendente de chegada" (spec §5.2, "(nova) → PENDENTE_CHEGADA"), com uma linha por unidade
 * e o evento no histórico. Funciona dentro de outra transação (a confirmação da planilha usa um savepoint).
 * Pela API (contrato §5.5): ator SISTEMA, sem usuário, e a chave é (canal, devolucao_externa_id) (spec §11).
 */
export async function criarDevolucao(db: DbOuTx, dados: DadosNovaDevolucao, opcoes: OpcoesCriacao): Promise<DevolucaoCriada> {
  exigirTransicao({ de: null, para: 'PENDENTE_CHEGADA', ator: opcoes.origem === 'API' ? 'SISTEMA' : opcoes.usuario.perfil });
  if (opcoes.origem === 'API') {
    const [existente] = await db
      .select({ codigo: devolucoes.codigo })
      .from(devolucoes)
      .where(and(eq(devolucoes.canal, dados.canal), eq(devolucoes.devolucaoExternaId, opcoes.canal.devolucaoExternaId)))
      .limit(1);
    if (existente) throw new ErroDevolucaoDuplicada(existente.codigo);
  } else {
    // Regra "uma devolução em andamento por pedido e canal": lê e depois insere, sem trava no banco. Decisão aceita
    // (sistema interno, pouca concorrência): duas criações simultâneas do mesmo pedido poderiam passar as duas.
    const existente = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(
      chavePedido(dados.canal, dados.pedido),
    );
    if (existente) throw new ErroDevolucaoDuplicada(existente);
    if (dados.rastreio) {
      const naoIdentificado = (await codigosNaoIdentificadosPorRastreio(db, [dados.rastreio])).get(dados.rastreio);
      if (naoIdentificado) throw new ErroDevolucao(mensagemRastreioNaoIdentificado(naoIdentificado));
    }
  }
  const unidades = expandirUnidades(dados.itens);
  if (unidades.length > LIMITE_UNIDADES_DEVOLUCAO) throw new ErroDevolucao(mensagemLimiteUnidades(unidades.length));
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);
  const agora = opcoes.origem === 'API' ? (opcoes.agora ?? null) : null;
  const doCanal =
    opcoes.origem === 'API'
      ? {
          pedidosExternos: [...new Set([dados.pedido, ...opcoes.canal.pedidos])],
          devolucaoExternaId: opcoes.canal.devolucaoExternaId,
          tipo: opcoes.canal.tipo,
          statusCanal: opcoes.canal.statusCanal,
          entregueSegundoCanalEm: opcoes.canal.entregueSegundoCanalEm,
          prazoConferenciaCanal: opcoes.canal.prazoConferenciaCanal,
          criadoPor: null,
          ...(agora ? { criadaEm: agora, atualizadaEm: agora } : {}),
        }
      : { pedidosExternos: [dados.pedido], criadoPor: opcoes.usuario.id };

  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        canal: dados.canal,
        origem: opcoes.origem,
        reclamacaoId: dados.reclamacaoId,
        rastreio: dados.rastreio,
        transportadora: dados.transportadora,
        motivoCliente: dados.motivoCliente,
        postadaEm: dados.postadaEm,
        status: 'PENDENTE_CHEGADA',
        ...doCanal,
      })
      .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
    if (unidades.length > 0) {
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({
          devolucaoId: criada.id,
          unidade: i + 1,
          sku,
          produtoEsperadoId: produtosPorSku.get(sku) ?? null,
        })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: criada.id,
      acao: 'criada',
      de: null,
      para: 'PENDENTE_CHEGADA',
      usuarioId: opcoes.origem === 'API' ? null : opcoes.usuario.id,
      dados: { origem: opcoes.origem, unidades: unidades.length },
      ...(agora ? { em: agora } : {}),
    });
    return { id: criada.id, codigo: criada.codigo, unidades: unidades.length };
  });
}
