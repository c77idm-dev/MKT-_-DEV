import {
  configurarFiscalTeste,
  criarDevolucaoNoEstoqueTeste,
  inserirNotaVendaTeste,
  limparFiscalTeste,
  type UnidadeEstoqueTeste,
} from '../helpers/fabricas-fiscal';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** Deixa a emissão pronta (empresa em SP, Simples, homologação e as 6 regras sugeridas). Cada spec chama no começo. */
export async function prepararFiscal(opcoes: Parameters<typeof configurarFiscalTeste>[2] = {}): Promise<void> {
  await comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    await configurarFiscalTeste(db, gestor, opcoes);
  });
}

export async function limparFiscal(): Promise<void> {
  await comBanco((db) => limparFiscalTeste(db));
}

/**
 * Devolução em AGUARDANDO_NF gravada direto no banco (o estado que a conferência da Fase 2 deixa), com um SKU único por
 * execução (o banco do e2e é o mesmo para o computador e o celular). Por padrão grava também a NF de venda com esse SKU;
 * `codigoNaVenda` troca o código do item da venda (para o Fiscal ter de escolher, D14).
 */
export async function devolucaoNoEstoque(opcoes: {
  destinos: UnidadeEstoqueTeste['destino'][];
  comNotaVenda?: boolean;
  codigoNaVenda?: string;
}): Promise<{ id: string; codigo: string; sku: string; itens: { id: string; unidade: number; sku: string }[] }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const sku = codigoUnico('SKU');
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: opcoes.destinos.map((destino) => ({ sku, destino })) });
    if (opcoes.comNotaVenda ?? true) {
      const fisicas = opcoes.destinos.filter((d) => d !== 'AUSENTE').length;
      await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: opcoes.codigoNaVenda ?? sku, quantidade: Math.max(1, fisicas), valorUnitario: 50 }] });
    }
    return { id: dev.id, codigo: dev.codigo, sku, itens: dev.itens };
  });
}
