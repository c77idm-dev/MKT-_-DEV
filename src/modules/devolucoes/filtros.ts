import { formatarDataIso } from '@/lib/formatar';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { ehCanal, ehStatus, ROTULO_CANAL, ROTULO_STATUS, type Canal, type StatusDevolucao } from './dominio';

export const POR_PAGINA_DEVOLUCOES = 30;

/** Busca Avançada (spec §6.7). Os nomes na tela são os do PDF; aqui ficam as chaves da URL. */
export type FiltrosBusca = {
  rastreio?: string;
  pedido?: string;
  reclamacao?: string;
  canal?: Canal;
  status?: StatusDevolucao;
  fornecedor?: string;
  codigo?: string;
  /** (extra) Período, pela data de cadastro: "2026-11-01". */
  de?: string;
  ate?: string;
};
export type ChaveFiltro = keyof FiltrosBusca;

const ORDEM: ChaveFiltro[] = ['rastreio', 'pedido', 'reclamacao', 'canal', 'status', 'fornecedor', 'codigo', 'de', 'ate'];
const ROTULO_FILTRO: Record<ChaveFiltro, string> = {
  rastreio: 'Rastreio',
  pedido: 'Pedido',
  reclamacao: 'Reclamação',
  canal: 'Marketplace',
  status: 'Status',
  fornecedor: 'Fornecedor',
  codigo: 'Código',
  de: 'De',
  ate: 'Até',
};
const TEXTO_MAXIMO = 100;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function lerFiltros(parametros: ParametrosBusca): FiltrosBusca {
  const f: FiltrosBusca = {};
  for (const chave of ['rastreio', 'pedido', 'reclamacao', 'fornecedor', 'codigo'] as const) {
    const valor = primeiroValor(parametros[chave]).slice(0, TEXTO_MAXIMO);
    if (valor) f[chave] = valor;
  }
  const canal = primeiroValor(parametros.canal);
  if (ehCanal(canal)) f.canal = canal;
  const status = primeiroValor(parametros.status);
  if (ehStatus(status)) f.status = status;
  for (const chave of ['de', 'ate'] as const) {
    const valor = primeiroValor(parametros[chave]);
    if (DATA.test(valor)) f[chave] = valor;
  }
  return f;
}

export function temFiltro(f: FiltrosBusca): boolean {
  return Object.keys(f).length > 0;
}

/** "?rastreio=BR1&pagina=2", ou "" quando não há nada. */
export function filtrosParaQuery(f: FiltrosBusca, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries({ ...f, ...extra })) {
    if (valor) p.set(chave, valor);
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export function semFiltro(f: FiltrosBusca, chave: ChaveFiltro): FiltrosBusca {
  const copia = { ...f };
  delete copia[chave];
  return copia;
}

/** Etiquetas dos filtros ativos. No celular elas ficam à vista mesmo com o painel fechado. */
export function descreverFiltros(f: FiltrosBusca): { chave: ChaveFiltro; texto: string }[] {
  return ORDEM.flatMap((chave) => {
    const valor = f[chave];
    if (!valor) return [];
    let mostrado: string = valor;
    if (chave === 'canal' && f.canal) mostrado = ROTULO_CANAL[f.canal];
    if (chave === 'status' && f.status) mostrado = ROTULO_STATUS[f.status];
    if (chave === 'de' || chave === 'ate') mostrado = formatarDataIso(valor);
    return [{ chave, texto: `${ROTULO_FILTRO[chave]}: ${mostrado}` }];
  });
}
