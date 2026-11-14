import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada } from '../../../tests/helpers/fabricas-conferencia';
import { localizarParaConferencia } from './localizar';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('localizarParaConferencia ("Conferir pacote", extra)', () => {
  it('acha pelo código DEV ou pelo rastreio lido na etiqueta', async () => {
    const d = await criarDevolucaoChegada(db, operador, { rastreio: 'BR123456789BR' });
    expect(await localizarParaConferencia(db, d.codigo.toLowerCase(), operador)).toEqual({ id: d.id, codigo: d.codigo });
    expect(await localizarParaConferencia(db, ' br 123 456 789 br ', operador)).toEqual({ id: d.id, codigo: d.codigo });
  });

  it('explica quando não dá', async () => {
    await expect(localizarParaConferencia(db, '  ', operador)).rejects.toThrow('Leia ou digite o código de rastreamento ou o código DEV.');
    await expect(localizarParaConferencia(db, 'BRNADA', operador)).rejects.toThrow('Nenhuma devolução com este código de rastreamento.');
    const pendente = await criarDevolucaoTeste(db, operador, { rastreio: 'BRPENDENTE' });
    await expect(localizarParaConferencia(db, 'BRPENDENTE', operador)).rejects.toThrow(`${pendente.codigo} está pendente de chegada. Registre a chegada no Recebimento primeiro.`);
  });

  it('mesmo rastreio em duas devoluções abertas (o mesmo pacote, Fase 1 decisão 8): pede para escolher pela lista', async () => {
    await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    const segunda = await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).rejects.toThrow(/tem 2 devoluções/);
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.id, segunda.id));
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).resolves.toMatchObject({ codigo: expect.stringMatching(/^DEV-/) });
  });
});
