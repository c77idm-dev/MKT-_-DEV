/**
 * Dossiê de provas (PDF) (extra, aprovado pelo usuário em 19/11/2026): tudo da devolução num arquivo só, para anexar na
 * resposta ao ML. Sem imports de servidor: a tela usa o caminho e o nome do arquivo.
 */
import type { Canal, DestinoItem, MotivoItem, StatusItem } from '@/modules/devolucoes/dominio';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';

/** DEV- e 6 ou mais dígitos (o banco completa com zeros até 6). */
const CODIGO = /^DEV-\d{6,12}$/;

export function normalizarCodigoDossie(codigo: string): string | null {
  const limpo = codigo.trim().toUpperCase();
  return CODIGO.test(limpo) ? limpo : null;
}

export function caminhoDossie(codigo: string): string {
  return `/api/devolucoes/${encodeURIComponent(codigo)}/dossie`;
}

export function nomeArquivoDossie(codigo: string): string {
  return `dossie-${codigo}.pdf`;
}

/** Acima disso o PDF é refeito uma vez com imagens menores (o ML recusa anexos grandes). */
export const LIMITE_BYTES_DOSSIE = 8 * 1024 * 1024;

export type OpcoesImagem = { ladoMaior: number; qualidade: number };
export const IMAGEM_PADRAO: OpcoesImagem = { ladoMaior: 1280, qualidade: 70 };
export const IMAGEM_REDUZIDA: OpcoesImagem = { ladoMaior: 1024, qualidade: 60 };

export const ACAO_DOSSIE_GERADO = 'dossie_gerado';

export const MENSAGEM_CONFERENCIA_PENDENTE =
  'A conferência desta devolução ainda não foi concluída. O dossiê de provas fica disponível depois dela.';

export type LeituraCodigo = 'confere' | 'nao_confere' | 'nao_lido';
export const ROTULO_LEITURA: Record<LeituraCodigo, string> = { confere: 'Confere', nao_confere: 'Não confere', nao_lido: 'Não lido' };

/** `divergente` vem da conferência: leu um EAN e o produto recebido não é o esperado. */
export function leituraDoCodigo(u: { eanLido: string | null; divergente: boolean }): LeituraCodigo {
  if (u.eanLido === null) return 'nao_lido';
  return u.divergente ? 'nao_confere' : 'confere';
}

/** "0:42", "1:05", "1:02:03". */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export type UnidadeDossie = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  /** Do produto esperado (null quando o SKU está fora do cadastro). */
  descricao: string | null;
  eanEsperado: string | null;
  eanLido: string | null;
  divergente: boolean;
  produtoRecebido: { sku: string; descricao: string } | null;
  serial: string | null;
  loteFabricacao: string | null;
  validade: string | null;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};

export type EvidenciaDossie = {
  id: string;
  tipo: TipoEvidencia;
  /** A unidade (Fotos 3 e 4 e fotos da avaria); null nas Fotos 1 e 2 e no Vídeo de Prova. */
  itemId: string | null;
  situacao: SituacaoProcessamento;
  tipoConteudo: string;
  caminho: string | null;
  provedor: string | null;
  /** Hora em que o servidor recebeu: é a do carimbo da foto (decisão 6). */
  enviadoEm: Date;
  enviadoPorNome: string | null;
  processadoEm: Date | null;
  tamanho: number | null;
  sha256Original: string;
  sha256Final: string | null;
};

export type EventoDossie = {
  acao: string;
  de: string | null;
  para: string | null;
  em: Date;
  usuarioNome: string | null;
  dados: Record<string, unknown> | null;
};

/** Tudo o que o PDF mostra. Nenhum dado pessoal do comprador (o sistema não guarda). */
export type DadosDossie = {
  id: string;
  codigo: string;
  canal: Canal | null;
  /** Razão social das Configurações (null enquanto não foi preenchida). */
  empresa: string | null;
  pedidos: string[];
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  /** Conta do vendedor no ML (nome da conta do Bitbrain); null no modo api. */
  contaML: string | null;
  motivoReclamacaoML: { id: string; texto: string | null } | null;
  rastreio: string | null;
  transportadora: string | null;
  motivoCliente: string | null;
  recebidaEm: Date | null;
  recebidaPorNome: string | null;
  conferenciaIniciadaEm: Date | null;
  conferidaEm: Date | null;
  conferenteNome: string | null;
  unidades: UnidadeDossie[];
  evidencias: EvidenciaDossie[];
  eventos: EventoDossie[];
  geradoEm: Date;
  geradoPorNome: string;
};
