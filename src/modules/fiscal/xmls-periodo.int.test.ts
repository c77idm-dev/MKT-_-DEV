import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNota, solicitarEmissao } from './emissao';
import { gerarZipXmls } from './xmls-periodo';

const { db, sql } = criarDbTeste();
const OUTUBRO = new Date('2026-10-20T15:00:00Z');
const NOVEMBRO = new Date('2026-11-12T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

async function autorizarEm(agora: Date) {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
  await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01' }] });
  const { notaFiscalId } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
  await rodarTarefasFiscais(db, fila, agora);
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
  return nota;
}

describe('gerarZipXmls (spec §8.7, decisão 10)', () => {
  it('traz o XML das autorizadas e dos cancelamentos do período, só do ambiente atual', async () => {
    const outubro = await autorizarEm(OUTUBRO);
    const novembro = await autorizarEm(NOVEMBRO);
    await cancelarNota(db, novembro.id, 'Cliente desistiu da devolução', fiscal, new Date(NOVEMBRO.getTime() + 60 * 60 * 1000));

    const zip = await gerarZipXmls(db, { de: '2026-11-01', ate: '2026-11-30' });
    if (!zip.ok) throw new Error(`esperava o ZIP, veio ${zip.codigo}`);
    expect(zip.nome).toBe('xmls-nfe-homologacao-2026-11-01-a-2026-11-30.zip');
    expect(zip.quantidade).toBe(2);
    const arquivos = unzipSync(zip.conteudo);
    expect(Object.keys(arquivos).sort()).toEqual([`${novembro.chave}-cancelamento.xml`, `${novembro.chave}-nfe.xml`]);
    expect(strFromU8(arquivos[`${novembro.chave}-nfe.xml`])).toContain(`<chNFe>${novembro.chave}</chNFe>`);
    expect(strFromU8(arquivos[`${novembro.chave}-cancelamento.xml`])).toContain('<tpEvento>110111</tpEvento>');

    const zipOutubro = await gerarZipXmls(db, { de: '2026-10-01', ate: '2026-10-31' });
    expect(zipOutubro.ok && Object.keys(unzipSync(zipOutubro.conteudo))).toEqual([`${outubro.chave}-nfe.xml`]);
    expect(await gerarZipXmls(db, { de: '2026-11-01', ate: '2026-11-30' }, 'PRODUCAO')).toEqual({ ok: false, codigo: 'vazio' });
    expect(await gerarZipXmls(db, { de: '2026-09-01', ate: '2026-11-30' })).toEqual({ ok: false, codigo: 'periodo' });
  });
});
