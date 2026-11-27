import { ROTULO_STATUS_LOTE, type StatusLote } from '../lotes/dominio';
import type { DestinoItem, MotivoItem, Origem, StatusDevolucao, StatusItem } from './dominio';

/**
 * Corrigir (Gestor) (extra, emenda E29): o que a seção mostra para cada status. É só a tela: quem decide é o servidor
 * (`correcoes.ts` e `encerrarPendente`), que recusa com a mensagem do motivo. Sem imports com "@/": vale nos testes de
 * unidade sem banco.
 */

export type UnidadeCorrecao = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
  /** O SKU do produto recebido (vazio antes da conferência ou fora do cadastro). */
  produtoRecebidoSku: string | null;
  loteCodigo: string | null;
  loteStatus: StatusLote | null;
};

export type DadosCorrecao = {
  status: StatusDevolucao;
  naoIdentificada: boolean;
  origem: Origem;
  devolucaoExternaId: string | null;
  rastreio: string | null;
  observacoes: string | null;
  /** A NF de devolução em processamento ou autorizada (a rejeitada e a cancelada não seguram nada). */
  notaAtiva: 'PROCESSANDO' | 'AUTORIZADA' | null;
  unidades: UnidadeCorrecao[];
};

export type CorrecoesPermitidas = {
  trocarEstoque: boolean;
  reabrir: boolean;
  desfazer: boolean;
  encerrar: boolean;
  apagar: boolean;
  editarRastreio: boolean;
  /** Por que reabrir, desfazer, cancelar ou apagar sumiram (NF ativa ou unidade em lote). */
  bloqueio: string | null;
};

const DEPOIS_DA_CONFERENCIA: readonly StatusDevolucao[] = ['AGUARDANDO_NF', 'CONCLUIDA'];
const ANTES_DA_NF: readonly StatusDevolucao[] = ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF'];
const ENCERRAVEIS: readonly StatusDevolucao[] = ['PENDENTE_CHEGADA', ...ANTES_DA_NF];

const BLOQUEIO_NOTA = {
  AUTORIZADA: 'A NF de devolução está autorizada: reabrir, desfazer a chegada, cancelar e apagar ficam travados. O Fiscal cancela a NF antes.',
  PROCESSANDO: 'A NF de devolução está em processamento: espere o resultado antes de reabrir, desfazer a chegada, cancelar ou apagar.',
} as const;

export function correcoesPermitidas(d: DadosCorrecao): CorrecoesPermitidas {
  const semNota = d.notaAtiva === null;
  const emLote = d.unidades.find((u) => u.loteCodigo !== null);
  const livre = semNota && !emLote;
  const bloqueio = d.notaAtiva
    ? BLOQUEIO_NOTA[d.notaAtiva]
    : emLote
      ? `A unidade ${emLote.unidade} está no lote ${emLote.loteCodigo}: apagar fica travado enquanto ela estiver num lote.`
      : null;
  return {
    trocarEstoque: DEPOIS_DA_CONFERENCIA.includes(d.status),
    reabrir: d.status === 'AGUARDANDO_NF' && livre,
    desfazer: ANTES_DA_NF.includes(d.status) && !d.naoIdentificada && livre,
    encerrar: ENCERRAVEIS.includes(d.status) && (d.status !== 'AGUARDANDO_NF' || semNota),
    apagar: livre,
    editarRastreio: d.origem !== 'API' && d.devolucaoExternaId === null,
    bloqueio,
  };
}

/** Por que a unidade não troca de estoque; null quando troca (a mesma regra de `trocarDestinoItem`). */
export function motivoSemTroca(u: UnidadeCorrecao): string | null {
  if (u.status === 'PENDENTE') return 'A conferência desta unidade ainda não terminou.';
  if (u.status === 'AUSENTE' || u.destino === null) return 'Ausente. Para mudar, reabra a conferência.';
  if (u.status === 'ENVIADO') return 'Já foi enviada ao fornecedor: o estoque dela não muda mais.';
  if (u.status === 'RESOLVIDO') return 'Já foi resolvida com o fornecedor: o estoque dela não muda mais.';
  if (u.loteStatus && u.loteStatus !== 'ABERTO') {
    return `Está no lote ${u.loteCodigo} (${ROTULO_STATUS_LOTE[u.loteStatus]}): só dá para trocar enquanto o lote está Aberto.`;
  }
  return null;
}
