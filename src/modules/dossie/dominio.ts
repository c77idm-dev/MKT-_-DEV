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

/** `marca`: a do toque no botão (?n=); o PDF pronto volta com o cookie dela, e a tela encerra o "Gerando…". */
export function caminhoDossie(codigo: string, marca?: string): string {
  return `/api/devolucoes/${encodeURIComponent(codigo)}/dossie${marca ? `?n=${marca}` : ''}`;
}

/** 16 caracteres hexadecimais (8 bytes aleatórios): só isso vira nome de cookie. */
export function ehMarcaDossie(marca: string | null | undefined): marca is string {
  return typeof marca === 'string' && /^[0-9a-f]{16}$/.test(marca);
}

export function cookieDossiePronto(marca: string): string {
  return `dossie_${marca}`;
}

export function nomeArquivoDossie(codigo: string): string {
  return `dossie-${codigo}.pdf`;
}

/** Acima disso o PDF é refeito uma vez com imagens menores (o ML recusa anexos grandes). */
export const LIMITE_BYTES_DOSSIE = 8 * 1024 * 1024;

export type OpcoesImagem = { ladoMaior: number; qualidade: number };
export const IMAGEM_PADRAO: OpcoesImagem = { ladoMaior: 1280, qualidade: 70 };
export const IMAGEM_REDUZIDA: OpcoesImagem = { ladoMaior: 1024, qualidade: 60 };

/**
 * Teto de fotos no corpo do PDF: cabe nos 8 MB a 1024 px/60 e limita a memória do pdf-lib (o web tem 512 MB). As de
 * cima viram um aviso ("veja no sistema"); os hashes de todas continuam na integridade.
 */
export const MAX_FOTOS_DOSSIE = 120;

/** Peso médio de uma imagem a 1280 px/70 no PDF, para escolher a qualidade antes da 1ª passada. */
const BYTES_POR_IMAGEM = 170 * 1024;

/** Quando a estimativa já passa do limite, começa direto nas imagens reduzidas (sem montar o PDF duas vezes). */
export function opcoesIniciais(imagens: number, limiteBytes: number): OpcoesImagem {
  return imagens * BYTES_POR_IMAGEM > limiteBytes ? IMAGEM_REDUZIDA : IMAGEM_PADRAO;
}

export const ACAO_DOSSIE_GERADO = 'dossie_gerado';

export const MENSAGEM_CONFERENCIA_PENDENTE =
  'A conferência desta devolução ainda não foi concluída. O dossiê de provas fica disponível depois dela.';

export type LeituraCodigo = 'confere' | 'nao_confere' | 'nao_lido' | 'sem_referencia';
export const ROTULO_LEITURA: Record<LeituraCodigo, string> = {
  confere: 'Confere',
  nao_confere: 'Não confere',
  nao_lido: 'Não lido',
  sem_referencia: 'Sem EAN de referência no cadastro (não comparado)',
};

/**
 * Como a tela da conferência (compararEan): `divergente` vem dela (leu um EAN e o produto recebido não é o esperado).
 * Sem EAN esperado nada foi comparado, e o PDF não pode dizer "Confere": a tela pede "confira pela descrição".
 * Com o SKU fora do cadastro (`descricao` null) a tela também diz "sem referência", mesmo que o EAN ache outro produto.
 */
export function leituraDoCodigo(u: { eanLido: string | null; eanEsperado: string | null; divergente: boolean; descricao: string | null }): LeituraCodigo {
  if (u.eanLido === null) return 'nao_lido';
  if (u.descricao === null) return 'sem_referencia';
  if (u.divergente) return 'nao_confere';
  return u.eanEsperado === null ? 'sem_referencia' : 'confere';
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

/**
 * Tudo o que o PDF mostra. Nenhum campo de texto com dado do comprador (o destinatário da NF, em notas_venda, fica de
 * fora); mas a Foto 1 (etiqueta de rastreio e declaração de conteúdo) pode mostrar o nome e o endereço dele na imagem.
 */
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
