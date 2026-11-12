import { normalizarTexto } from '@/lib/texto';
import type { Planilha } from './planilha';
import type { Mapeamento } from './tipos';

export type CampoImportacao = { chave: string; rotulo: string; obrigatorio: boolean; sinonimos: readonly string[] };
export type LinhaMapeada = { numeroLinha: number; valores: Record<string, string> };

function candidatos(campo: CampoImportacao): string[] {
  return [campo.chave.replace(/_/g, ' '), campo.rotulo, ...campo.sinonimos].map(normalizarTexto).filter(Boolean);
}

/**
 * Sugere a coluna de cada campo (spec §6.8): primeiro o último mapeamento salvo do tipo,
 * depois nome igual (sem acento, maiúscula e pontuação), por fim uma coluna que contém todas as palavras de um sinônimo.
 * Cada coluna vai para no máximo um campo.
 */
export function sugerirMapeamento(
  campos: readonly CampoImportacao[],
  cabecalhos: readonly string[],
  salvo?: Mapeamento | null,
): Mapeamento {
  const resultado: Mapeamento = Object.fromEntries(campos.map((c) => [c.chave, null]));
  const usados = new Set<string>();
  const escolher = (chave: string, cabecalho: string) => {
    resultado[chave] = cabecalho;
    usados.add(cabecalho);
  };

  if (salvo) {
    for (const campo of campos) {
      const cabecalho = salvo[campo.chave];
      if (cabecalho && cabecalhos.includes(cabecalho) && !usados.has(cabecalho)) escolher(campo.chave, cabecalho);
    }
  }

  const normalizados = cabecalhos.map((cabecalho) => ({ cabecalho, texto: normalizarTexto(cabecalho) }));

  for (const campo of campos) {
    if (resultado[campo.chave]) continue;
    const alvos = new Set(candidatos(campo));
    const achado = normalizados.find((n) => !usados.has(n.cabecalho) && alvos.has(n.texto));
    if (achado) escolher(campo.chave, achado.cabecalho);
  }

  for (const campo of campos) {
    if (resultado[campo.chave]) continue;
    const listas = candidatos(campo).map((c) => c.split(' '));
    const achado = normalizados.find((n) => {
      if (usados.has(n.cabecalho)) return false;
      const palavras = new Set(n.texto.split(' '));
      return listas.some((lista) => lista.every((p) => palavras.has(p)));
    });
    if (achado) escolher(campo.chave, achado.cabecalho);
  }

  return resultado;
}

/** Aceita só campos conhecidos e colunas que existem na planilha; cada coluna vai para no máximo um campo. */
export function sanitizarMapeamento(
  campos: readonly CampoImportacao[],
  cabecalhos: readonly string[],
  bruto: Record<string, unknown>,
): Mapeamento {
  const resultado: Mapeamento = {};
  const usados = new Set<string>();
  for (const campo of campos) {
    const valor = bruto[campo.chave];
    if (typeof valor === 'string' && cabecalhos.includes(valor) && !usados.has(valor)) {
      resultado[campo.chave] = valor;
      usados.add(valor);
    } else {
      resultado[campo.chave] = null;
    }
  }
  return resultado;
}

export function camposFaltando(campos: readonly CampoImportacao[], mapeamento: Mapeamento): CampoImportacao[] {
  return campos.filter((c) => c.obrigatorio && !mapeamento[c.chave]);
}

/** Uma LinhaMapeada por linha com algum valor. `numeroLinha` é o número da linha na planilha (o cabeçalho é a linha 1, ou `linhaCabecalho` quando há linhas em branco antes). */
export function aplicarMapeamento(planilha: Planilha, campos: readonly CampoImportacao[], mapeamento: Mapeamento): LinhaMapeada[] {
  const indices = campos.map((campo) => {
    const cabecalho = mapeamento[campo.chave];
    return { chave: campo.chave, indice: cabecalho ? planilha.cabecalhos.indexOf(cabecalho) : -1 };
  });
  const resultado: LinhaMapeada[] = [];
  const primeiraLinha = (planilha.linhaCabecalho ?? 1) + 1;
  planilha.linhas.forEach((linha, i) => {
    const valores: Record<string, string> = {};
    for (const { chave, indice } of indices) valores[chave] = indice >= 0 ? (linha[indice] ?? '').trim() : '';
    if (Object.values(valores).every((v) => v === '')) return;
    resultado.push({ numeroLinha: i + primeiraLinha, valores });
  });
  return resultado;
}
