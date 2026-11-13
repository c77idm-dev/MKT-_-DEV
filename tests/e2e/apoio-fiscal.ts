import { configurarFiscalTeste, limparFiscalTeste } from '../helpers/fabricas-fiscal';
import { comBanco, usuarioPorEmail } from './apoio';
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
