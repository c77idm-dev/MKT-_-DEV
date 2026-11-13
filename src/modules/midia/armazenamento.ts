import type { Readable } from 'node:stream';
import { lerEnv } from '@/lib/env';
import { ArmazenamentoDisco } from './armazenamento-disco';

/** Spec §4.3 e contrato §5.2. A Fase 2 (Parte B) acrescenta o ArmazenamentoS3 (B2 ou R2). */
export interface ArmazenamentoArquivos {
  salvar(caminho: string, conteudo: Readable, opcoes?: { tipoConteudo?: string; tamanho?: number }): Promise<void>;
  ler(caminho: string): Promise<Readable>;
  /** Spec §9: 10 min; nunca público. */
  urlTemporaria(caminho: string, segundos: number): Promise<string>;
  apagar(caminho: string): Promise<void>;
  existe(caminho: string): Promise<boolean>;
}

export type ProvedorArmazenamento = 'disco' | 's3' | 'memoria';

let paraTestes: ArmazenamentoArquivos | null = null;
const instancias = new Map<string, ArmazenamentoArquivos>();

/** Nos testes de integração: todo provedor responde com o armazenamento dado (e o cache é esquecido). */
export function definirArmazenamentoParaTestes(a: ArmazenamentoArquivos | null): void {
  paraTestes = a;
  instancias.clear();
}

/** O disco local (MIDIA_DIR). A rota /api/arquivos usa este, mesmo nos testes. */
export function discoLocal(): ArmazenamentoDisco {
  const env = lerEnv();
  return new ArmazenamentoDisco(env.MIDIA_DIR, env.SEGREDO_LINKS);
}

/** O armazenamento onde está um arquivo já gravado (coluna `provedor`): a troca disco → S3 não quebra os links antigos. */
export function armazenamentoDoProvedor(provedor: string): ArmazenamentoArquivos {
  if (paraTestes) return paraTestes;
  const existente = instancias.get(provedor);
  if (existente) return existente;
  let criado: ArmazenamentoArquivos;
  if (provedor === 'disco') criado = discoLocal();
  else throw new Error(`Provedor de armazenamento não disponível: ${provedor}`);
  instancias.set(provedor, criado);
  return criado;
}

/** Onde os arquivos novos são gravados (ARMAZENAMENTO no .env). */
export function provedorAtual(): ProvedorArmazenamento {
  return paraTestes ? 'memoria' : lerEnv().ARMAZENAMENTO;
}

export function obterArmazenamento(): ArmazenamentoArquivos {
  return paraTestes ?? armazenamentoDoProvedor(lerEnv().ARMAZENAMENTO);
}
