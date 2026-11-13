import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, notasFiscais } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { ROTULO_DESTINO } from '@/modules/devolucoes/dominio';
import type { TomSelo } from '@/modules/devolucoes/selos';
import { capacidade, casarItens, chaveAlvo, vagasRestantes, type MotivoCasamento } from './casamento';
import { numeroDaChave } from './chave';
import { dentroDoPrazoDeCancelamento, prazoDeCancelamento, ROTULO_ORIGEM_NOTA_VENDA, SELO_SITUACAO_NOTA, type SituacaoNotaFiscal } from './dominio';
import { carregarDadosDevolucao } from './montar-devolucao';
import type { NotaFiscalLinha } from './notas';

/** id → código DEV, para as mensagens da emissão em lote. */
export async function codigosDasDevolucoes(db: DbOuTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(inArray(devolucoes.id, ids));
  return new Map(linhas.map((l) => [l.id, l.codigo]));
}

/** O que a Seção Fiscal mostra de uma NF: textos e datas já prontos (o componente não formata nem calcula prazo). */
export type VistaNota = {
  id: string;
  situacao: SituacaoNotaFiscal;
  selo: string;
  tom: TomSelo;
  homologacao: boolean;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  motivoRejeicao: string | null;
  autorizadaEm: string | null;
  canceladaEm: string | null;
  justificativa: string | null;
  cancelavelAte: string | null;
  podeCancelar: boolean;
  prazoEncerrado: boolean;
  avisoSerie: string | null;
  xmlCaminho: string | null;
  danfeCaminho: string | null;
};
export type VistaNotaVenda = { id: string; chave: string; origem: string; emitidaEm: string | null; uf: string; itens: string[] };
export type VistaUnidade = {
  itemId: string;
  titulo: string;
  rotuloCurto: string;
  destino: string;
  casamento: string;
  valorAtual: string;
  precisaEscolher: boolean;
  escolhida: boolean;
};
export type OpcaoItemVenda = { valor: string; rotulo: string };
export type SituacaoFiscal = {
  notaAtiva: VistaNota | null;
  anteriores: VistaNota[];
  notasVenda: VistaNotaVenda[];
  unidades: VistaUnidade[];
  opcoes: OpcaoItemVenda[];
  canalMercadoLivre: boolean;
};

const TOM_NOTA: Record<SituacaoNotaFiscal, TomSelo> = { PROCESSANDO: 'destaque', AUTORIZADA: 'bom', REJEITADA: 'erro', CANCELADA: 'neutro' };
const MOTIVO: Record<MotivoCasamento, string> = { ESCOLHA: 'Escolhido pelo Fiscal', SKU: 'Casado pelo SKU', EAN: 'Casado pelo EAN' };

export function vistaDaNota(n: NotaFiscalLinha, serieConfigurada: string | null, agora: Date): VistaNota {
  const autorizada = n.situacao === 'AUTORIZADA' && n.autorizadaEm !== null;
  const podeCancelar = autorizada && n.autorizadaEm !== null && dentroDoPrazoDeCancelamento(n.autorizadaEm, agora);
  const serieDivergente = n.serie !== null && serieConfigurada !== null && Number(n.serie) !== Number(serieConfigurada);
  return {
    id: n.id,
    situacao: n.situacao,
    selo: SELO_SITUACAO_NOTA[n.situacao],
    tom: TOM_NOTA[n.situacao],
    homologacao: n.ambiente === 'HOMOLOGACAO',
    numero: n.numero,
    serie: n.serie,
    chave: n.chave,
    motivoRejeicao: n.motivoRejeicao,
    autorizadaEm: n.autorizadaEm ? formatarDataHora(n.autorizadaEm) : null,
    canceladaEm: n.canceladaEm ? formatarDataHora(n.canceladaEm) : null,
    justificativa: n.justificativaCancelamento,
    cancelavelAte: n.autorizadaEm ? formatarDataHora(prazoDeCancelamento(n.autorizadaEm)) : null,
    podeCancelar,
    prazoEncerrado: autorizada && !podeCancelar,
    avisoSerie: serieDivergente
      ? `A SEFAZ devolveu a série ${n.serie}, mas a configurada é ${serieConfigurada}: confira a série da empresa na Focus NFe.`
      : null,
    xmlCaminho: n.xmlCaminho,
    danfeCaminho: n.danfeCaminho,
  };
}

/** Tudo o que a Seção Fiscal precisa, numa leitura. `agora` decide se ainda dá para cancelar (24 h). */
export async function obterSituacaoFiscal(db: DbOuTx, devolucaoId: string, agora: Date = new Date()): Promise<SituacaoFiscal> {
  const config = await lerConfiguracao(db);
  const notas = await db.select().from(notasFiscais).where(eq(notasFiscais.devolucaoId, devolucaoId)).orderBy(desc(notasFiscais.criadaEm));
  const dados = await carregarDadosDevolucao(db, devolucaoId);
  const vistas = notas.map((n) => vistaDaNota(n, config.serieNfe ?? null, agora));
  const notasVenda = dados?.notasVenda ?? [];
  const unidades = dados?.unidades ?? [];
  const casamento = casarItens(unidades, notasVenda);
  const vagas = vagasRestantes(notasVenda, casamento);

  const rotulosDosItens = new Map<string, string>();
  const opcoes: OpcaoItemVenda[] = [];
  for (const nota of notasVenda) {
    for (const item of nota.itens) {
      const valor = chaveAlvo({ notaVendaId: nota.notaVendaId, numeroItem: item.numero });
      const rotulo = `NF ${numeroDaChave(nota.chave)} · item ${item.numero} · ${item.codigo} · ${item.descricao}`;
      rotulosDosItens.set(valor, rotulo);
      opcoes.push({ valor, rotulo: `${rotulo} (${Math.max(0, vagas.get(valor) ?? 0)} de ${capacidade(item.quantidade)} livres)` });
    }
  }

  return {
    notaAtiva: vistas.find((v) => v.situacao !== 'CANCELADA') ?? null,
    anteriores: vistas.filter((v) => v.situacao === 'CANCELADA'),
    notasVenda: notasVenda.map((n) => ({
      id: n.notaVendaId,
      chave: n.chave,
      origem: ROTULO_ORIGEM_NOTA_VENDA[n.origem],
      emitidaEm: n.emitidaEm ? formatarDataHora(n.emitidaEm) : null,
      uf: n.destinatario.uf,
      itens: n.itens.map((i) => `${i.codigo} × ${i.quantidade}`),
    })),
    unidades: unidades.map((u) => {
      const c = casamento.find((x) => x.itemId === u.itemId);
      const valor = c?.alvo ? chaveAlvo(c.alvo) : '';
      return {
        itemId: u.itemId,
        titulo: `Unidade ${u.unidade} · ${u.sku}${u.descricao ? ` · ${u.descricao}` : ''}`,
        rotuloCurto: `unidade ${u.unidade}`,
        destino: ROTULO_DESTINO[u.destino],
        casamento: c?.alvo && c.por ? `${MOTIVO[c.por]}: ${rotulosDosItens.get(valor) ?? ''}` : 'Sem item da NF de venda: escolha abaixo',
        valorAtual: valor,
        precisaEscolher: !c?.alvo,
        escolhida: c?.por === 'ESCOLHA',
      };
    }),
    opcoes,
    canalMercadoLivre: dados?.canal === 'MERCADO_LIVRE',
  };
}

/** As ações recebem o id da nota do formulário: confere que ela é desta devolução. */
export async function notaPertenceADevolucao(db: DbOuTx, notaFiscalId: string, devolucaoId: string): Promise<boolean> {
  const [nota] = await db
    .select({ id: notasFiscais.id })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.id, notaFiscalId), eq(notasFiscais.devolucaoId, devolucaoId)));
  return nota !== undefined;
}
