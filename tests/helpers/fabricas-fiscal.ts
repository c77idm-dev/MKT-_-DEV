import { asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { configuracoes, devolucoes, itensDevolucao, notasVenda, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DevolucaoCriada } from '@/modules/devolucoes/criar';
import type { Canal } from '@/modules/devolucoes/dominio';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { salvarAmbiente, salvarDadosEmpresa, type DadosEmpresa } from '@/modules/fiscal/configuracao';
import { OPERACOES_FISCAIS, TIPOS_NOTA, type OperacaoFiscal } from '@/modules/fiscal/dominio';
import { salvarRegra, sugestaoDeRegra } from '@/modules/fiscal/regras';
import { interpretarXmlNotaVenda } from '@/modules/fiscal/xml-nota-venda';
import { criarDevolucaoTeste } from './fabricas';
import { xmlNotaVendaTeste, type OpcoesXmlVenda } from './xml-nfe';

/**
 * Fábricas da Fase 4. O estado que a conferência (Fase 2) produz é gravado direto nas colunas (contrato §5.6),
 * sem chamar código da Fase 2. Não importe aqui nada que use a fila, o armazenamento ou o conector (o e2e importa este arquivo).
 */

export type MotivoProblemaTeste = 'AVARIADO' | 'USADO' | 'DIVERGENTE' | 'INCOMPLETO' | 'COM_DEFEITO' | 'OUTRO';
export type UnidadeEstoqueTeste = {
  sku?: string;
  destino: 'BOM' | 'PROBLEMA' | 'AUSENTE';
  motivo?: MotivoProblemaTeste;
  serial?: string | null;
  eanLido?: string | null;
};
export type DevolucaoNoEstoque = DevolucaoCriada & { itens: { id: string; unidade: number; sku: string }[] };

/** Devolução em AGUARDANDO_NF, uma unidade por entrada de `unidades` (contrato §5.6: casos a, b e c). */
export async function criarDevolucaoNoEstoqueTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  opcoes: { unidades: UnidadeEstoqueTeste[]; canal?: Canal; pedido?: string; agora?: Date },
): Promise<DevolucaoNoEstoque> {
  const criada = await criarDevolucaoTeste(db, usuario, {
    ...(opcoes.canal ? { canal: opcoes.canal } : {}),
    ...(opcoes.pedido ? { pedido: opcoes.pedido } : {}),
    itens: opcoes.unidades.map((u) => ({ sku: u.sku ?? 'SKU-TESTE', quantidade: 1 })),
  });
  const itens = await db
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade, sku: itensDevolucao.sku })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  for (const [i, item] of itens.entries()) {
    const u = opcoes.unidades[i];
    await db
      .update(itensDevolucao)
      .set(
        u.destino === 'AUSENTE'
          ? { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }
          : {
              status: 'AGUARDANDO_NF',
              destino: u.destino,
              motivo: u.destino === 'PROBLEMA' ? (u.motivo ?? 'AVARIADO') : null,
              serial: u.serial ?? null,
              eanLido: u.eanLido ?? null,
            },
      )
      .where(eq(itensDevolucao.id, item.id));
  }
  const agora = opcoes.agora ?? new Date();
  await db.update(devolucoes).set({ status: 'AGUARDANDO_NF', recebidaEm: agora, conferidaEm: agora }).where(eq(devolucoes.id, criada.id));
  return { ...criada, itens };
}

/** A empresa dos testes: CNPJ e IE válidos, em SP, no Simples, série 1 (a mesma que o emissor falso devolve). */
export const EMPRESA_TESTE: DadosEmpresa = {
  razaoSocial: 'Empresa Teste Ltda',
  cnpj: '11444777000161',
  ie: '110042490114',
  logradouro: 'Rua A',
  numero: '100',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01001000',
  regime: 'SIMPLES',
  serie: '1',
};

/**
 * Deixa a emissão pronta: dados da empresa, homologação e as 6 regras sugeridas. `naturezas` troca a natureza das regras de
 * devolução (ex.: "REJEITAR" faz o emissor falso rejeitar). `semRegras` apaga as regras (D13: a emissão fica recusada).
 */
export async function configurarFiscalTeste(
  db: DbOuTx,
  gestor: UsuarioSessao,
  opcoes: { regime?: RegimeTributario; uf?: string; serie?: string; naturezas?: Partial<Record<OperacaoFiscal, string>>; semRegras?: boolean } = {},
): Promise<void> {
  const regime = opcoes.regime ?? 'SIMPLES';
  await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime, uf: opcoes.uf ?? EMPRESA_TESTE.uf, serie: opcoes.serie ?? EMPRESA_TESTE.serie }, gestor);
  await salvarAmbiente(db, 'HOMOLOGACAO', gestor);
  await db.delete(regrasFiscais);
  if (opcoes.semRegras) return;
  for (const tipo of TIPOS_NOTA) {
    for (const operacao of OPERACOES_FISCAIS) {
      const regra = sugestaoDeRegra(tipo, operacao, regime);
      const natureza = tipo === 'DEVOLUCAO_VENDA' ? opcoes.naturezas?.[operacao] : undefined;
      await salvarRegra(db, { ...regra, naturezaOperacao: natureza ?? regra.naturezaOperacao }, gestor);
    }
  }
}

/** Volta ao começo: sem regras e sem dados da empresa (a linha de configurações continua existindo). */
export async function limparFiscalTeste(db: DbOuTx): Promise<void> {
  await db.delete(regrasFiscais);
  await db.update(configuracoes).set({
    razaoSocial: null,
    cnpj: null,
    ie: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    regimeTributario: null,
    serieNfe: null,
    ambienteNfe: 'HOMOLOGACAO',
  });
}

/**
 * Grava a NF de venda direto no banco (sem o arquivo no armazenamento), lida do XML de teste pelo mesmo leitor da produção.
 * O e2e usa: o processo do teste e o servidor não compartilham o armazenamento em memória.
 */
export async function inserirNotaVendaTeste(db: DbOuTx, devolucaoId: string, opcoes: OpcoesXmlVenda): Promise<{ notaVendaId: string; chave: string }> {
  const dados = interpretarXmlNotaVenda(xmlNotaVendaTeste(opcoes).xml);
  const [nota] = await db
    .insert(notasVenda)
    .values({
      devolucaoId,
      chave: dados.chave,
      origem: 'ANEXO',
      xmlCaminho: `notas-venda/${devolucaoId}/teste-${dados.chave}.xml`,
      destinatario: dados.destinatario,
      itens: dados.itens,
      emitidaEm: dados.emitidaEm,
    })
    .returning({ id: notasVenda.id });
  return { notaVendaId: nota.id, chave: dados.chave };
}
