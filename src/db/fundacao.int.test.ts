import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, evidencias, itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../tests/helpers/fabricas';

const { db, sql } = criarDbTeste();
let devolucaoId: string;
let itemId: string;

function codigoPg(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
async function codigoDoErro(promessa: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promessa;
    return undefined;
  } catch (erro) {
    return codigoPg(erro);
  }
}
function evidencia(extra: Partial<typeof evidencias.$inferInsert> = {}): typeof evidencias.$inferInsert {
  return {
    devolucaoId,
    tipo: 'FOTO_1_ETIQUETA',
    tipoConteudo: 'image/jpeg',
    tamanhoOriginal: 10,
    sha256Original: 'a'.repeat(64),
    idCliente: randomUUID(),
    ...extra,
  };
}

beforeEach(async () => {
  await limparTabelas(sql);
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  const criada = await criarDevolucaoTeste(db, operador, { itens: [{ sku: 'SKU-1', quantidade: 2 }] });
  devolucaoId = criada.id;
  const [primeiro] = await db
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
  itemId = primeiro.id;
});
afterAll(async () => {
  await sql.end();
});

describe('itens_destino_motivo (contrato §4.1)', () => {
  const gravar = (destino: 'BOM' | 'PROBLEMA' | null, motivo: 'AVARIADO' | 'AUSENTE' | null) =>
    db.update(itensDevolucao).set({ destino, motivo }).where(eq(itensDevolucao.id, itemId));

  it('aceita BOM sem motivo, PROBLEMA com motivo e ausente sem destino', async () => {
    expect(await codigoDoErro(gravar('BOM', null))).toBeUndefined();
    expect(await codigoDoErro(gravar('PROBLEMA', 'AVARIADO'))).toBeUndefined();
    expect(await codigoDoErro(gravar(null, 'AUSENTE'))).toBeUndefined();
    expect(await codigoDoErro(gravar(null, null))).toBeUndefined();
  });

  it('recusa BOM com motivo, PROBLEMA sem motivo, PROBLEMA ausente e motivo sem destino', async () => {
    expect(await codigoDoErro(gravar('BOM', 'AVARIADO'))).toBe('23514');
    expect(await codigoDoErro(gravar('PROBLEMA', null))).toBe('23514');
    expect(await codigoDoErro(gravar('PROBLEMA', 'AUSENTE'))).toBe('23514');
    expect(await codigoDoErro(gravar(null, 'AVARIADO'))).toBe('23514');
  });
});

describe('evidencias', () => {
  it('Fotos 3 e 4 exigem a unidade', async () => {
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO' })))).toBe('23514');
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId })))).toBeUndefined();
  });

  it('uma Foto 1 por devolução e uma Foto 3 por unidade; Extra pode repetir', async () => {
    await db.insert(evidencias).values(evidencia());
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia()))).toBe('23505');
    await db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId })))).toBe('23505');
    await db.insert(evidencias).values(evidencia({ tipo: 'EXTRA' }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'EXTRA' })))).toBeUndefined();
  });

  it('id_cliente é único (o mesmo envio não grava duas vezes)', async () => {
    const idCliente = randomUUID();
    await db.insert(evidencias).values(evidencia({ idCliente }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ idCliente, tipo: 'FOTO_2_EMBALAGEM' })))).toBe('23505');
  });
});

describe('configuracoes', () => {
  it('só existe a linha 1', async () => {
    expect(await codigoDoErro(db.insert(configuracoes).values({ id: 2 }))).toBe('23514');
    expect(await codigoDoErro(db.insert(configuracoes).values({}))).toBeUndefined();
  });
});
