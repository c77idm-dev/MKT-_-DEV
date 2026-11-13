import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { zipSync } from 'fflate';
import type { DbOuTx } from '@/db/client';
import { notasFiscais } from '@/db/schema';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { lerArquivo } from './arquivos';
import { validarPeriodo } from './periodo';

export type ResultadoZip =
  | { ok: true; nome: string; conteudo: Uint8Array; quantidade: number }
  | { ok: false; codigo: 'periodo' | 'vazio' };

/**
 * Spec §8.7 ("Baixar XMLs do período", ponte com o Bitbrain), decisão 10: XML das notas autorizadas no período (mesmo as
 * canceladas depois) e XML dos cancelamentos do período, só do ambiente indicado (padrão: o atual da configuração).
 */
export async function gerarZipXmls(db: DbOuTx, periodo: { de: string; ate: string }, ambiente?: AmbienteNfe): Promise<ResultadoZip> {
  if (!validarPeriodo(periodo.de, periodo.ate)) return { ok: false, codigo: 'periodo' };
  const doAmbiente = ambiente ?? (await lerConfiguracao(db)).ambienteNfe;
  const inicio = sql`(${periodo.de}::date::timestamp at time zone 'America/Sao_Paulo')`;
  const fim = sql`((${periodo.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
  const autorizadas = await db
    .select({ chave: notasFiscais.chave, caminho: notasFiscais.xmlCaminho })
    .from(notasFiscais)
    .where(
      and(
        eq(notasFiscais.ambiente, doAmbiente),
        isNotNull(notasFiscais.chave),
        isNotNull(notasFiscais.xmlCaminho),
        sql`${notasFiscais.autorizadaEm} >= ${inicio}`,
        sql`${notasFiscais.autorizadaEm} < ${fim}`,
      ),
    )
    .orderBy(asc(notasFiscais.autorizadaEm));
  const cancelamentos = await db
    .select({ chave: notasFiscais.chave, caminho: notasFiscais.xmlCancelamentoCaminho })
    .from(notasFiscais)
    .where(
      and(
        eq(notasFiscais.ambiente, doAmbiente),
        isNotNull(notasFiscais.chave),
        isNotNull(notasFiscais.xmlCancelamentoCaminho),
        sql`${notasFiscais.canceladaEm} >= ${inicio}`,
        sql`${notasFiscais.canceladaEm} < ${fim}`,
      ),
    )
    .orderBy(asc(notasFiscais.canceladaEm));
  if (autorizadas.length + cancelamentos.length === 0) return { ok: false, codigo: 'vazio' };

  const arquivos: Record<string, Uint8Array> = {};
  for (const a of autorizadas) if (a.chave && a.caminho) arquivos[`${a.chave}-nfe.xml`] = await lerArquivo(a.caminho);
  for (const c of cancelamentos) if (c.chave && c.caminho) arquivos[`${c.chave}-cancelamento.xml`] = await lerArquivo(c.caminho);
  const sufixo = doAmbiente === 'HOMOLOGACAO' ? '-homologacao' : '';
  return {
    ok: true,
    nome: `xmls-nfe${sufixo}-${periodo.de}-a-${periodo.ate}.zip`,
    conteudo: zipSync(arquivos, { level: 6 }),
    quantidade: Object.keys(arquivos).length,
  };
}
