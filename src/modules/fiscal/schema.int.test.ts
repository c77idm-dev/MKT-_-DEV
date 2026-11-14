import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais, notasVenda, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { referenciaDaNota } from './dominio';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

function novaNota(devolucaoId: string | null, loteId: string | null = null) {
  const id = randomUUID();
  return {
    id,
    tipo: 'DEVOLUCAO_VENDA' as const,
    devolucaoId,
    loteId,
    ambiente: 'HOMOLOGACAO' as const,
    referenciaEmissor: referenciaDaNota(id),
  };
}

const DESTINATARIO = {
  nome: 'Maria',
  cpf: '52998224725',
  cnpj: null,
  ie: null,
  indicadorIe: 9 as const,
  logradouro: 'Rua B',
  numero: '50',
  complemento: null,
  bairro: 'Jardim',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01002000',
};

describe('tabelas fiscais (contrato §4.3)', () => {
  it('uma NF ativa por devolução: outra só depois de cancelar a anterior', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const primeira = novaNota(dev.id);
    await db.insert(notasFiscais).values(primeira);
    await expect(db.insert(notasFiscais).values(novaNota(dev.id))).rejects.toThrow();
    await db.update(notasFiscais).set({ situacao: 'CANCELADA' }).where(eq(notasFiscais.id, primeira.id));
    await expect(db.insert(notasFiscais).values(novaNota(dev.id))).resolves.toBeDefined();
  });

  it('a nota é de uma devolução ou de um lote, nunca dos dois nem de nenhum', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    await expect(db.insert(notasFiscais).values(novaNota(null, null))).rejects.toThrow();
    await expect(db.insert(notasFiscais).values(novaNota(dev.id, randomUUID()))).rejects.toThrow();
    await expect(db.insert(notasFiscais).values({ ...novaNota(null, randomUUID()), tipo: 'REMESSA_CONSERTO' })).resolves.toBeDefined();
  });

  it('a referência do emissor é única e nasce em PROCESSANDO', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const outra = await criarDevolucaoTeste(db, gestor);
    const nota = novaNota(dev.id);
    await db.insert(notasFiscais).values(nota);
    await expect(db.insert(notasFiscais).values({ ...novaNota(outra.id), referenciaEmissor: nota.referenciaEmissor })).rejects.toThrow();
    const [gravada] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, nota.id));
    expect(gravada).toMatchObject({ situacao: 'PROCESSANDO', chavesReferenciadas: [], referenciaEmissor: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it('NF de venda única por (devolução, chave) e regra única por (tipo, operação)', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const venda = { devolucaoId: dev.id, chave: '35261011444777000161550010000001011000001012', origem: 'ANEXO' as const, xmlCaminho: 'x.xml', destinatario: DESTINATARIO, itens: [] };
    await db.insert(notasVenda).values(venda);
    await expect(db.insert(notasVenda).values(venda)).rejects.toThrow();

    const regra = {
      tipoNota: 'DEVOLUCAO_VENDA' as const,
      operacao: 'DENTRO_ESTADO' as const,
      cfop: '1202',
      icmsSituacaoTributaria: '900',
      pisSituacaoTributaria: '98',
      cofinsSituacaoTributaria: '98',
      naturezaOperacao: 'Devolucao de venda',
    };
    await db.insert(regrasFiscais).values(regra);
    await expect(db.insert(regrasFiscais).values(regra)).rejects.toThrow();
  });
});
