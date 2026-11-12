import { and, asc, inArray, notInArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { interpretarData, interpretarInteiro, textoOpcional } from '@/lib/valores';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import { interpretarCanal } from './canais';
import { CANAIS, LIMITE_QUANTIDADE, ROTULO_CANAL, type Canal, type StatusDevolucao } from './dominio';
import { ErroDevolucaoDuplicada } from './erros';
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

/**
 * Cadastra a devolução em "Pendente de chegada" (spec §5.2, "(nova) → PENDENTE_CHEGADA"), com uma linha por unidade
 * e o evento no histórico. Funciona dentro de outra transação (a confirmação da planilha usa um savepoint).
 */
export async function criarDevolucao(
  db: DbOuTx,
  dados: DadosNovaDevolucao,
  opcoes: { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao },
): Promise<DevolucaoCriada> {
  exigirTransicao({ de: null, para: 'PENDENTE_CHEGADA', ator: opcoes.usuario.perfil });
  // Regra "uma devolução em andamento por pedido e canal": lê e depois insere, sem trava no banco. Decisão aceita
  // (sistema interno, pouca concorrência): duas criações simultâneas do mesmo pedido poderiam passar as duas.
  const existente = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(
    chavePedido(dados.canal, dados.pedido),
  );
  if (existente) throw new ErroDevolucaoDuplicada(existente);
  const unidades = expandirUnidades(dados.itens);
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);

  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        canal: dados.canal,
        origem: opcoes.origem,
        pedidosExternos: [dados.pedido],
        reclamacaoId: dados.reclamacaoId,
        rastreio: dados.rastreio,
        transportadora: dados.transportadora,
        motivoCliente: dados.motivoCliente,
        postadaEm: dados.postadaEm,
        status: 'PENDENTE_CHEGADA',
        criadoPor: opcoes.usuario.id,
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
      usuarioId: opcoes.usuario.id,
      dados: { origem: opcoes.origem, unidades: unidades.length },
    });
    return { id: criada.id, codigo: criada.codigo, unidades: unidades.length };
  });
}
