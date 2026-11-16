import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, eventosHistorico, evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { removerFotoAvaria } from './remocao';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

async function existe(id: string) {
  return (await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.id, id))).length === 1;
}

describe('removerFotoAvaria (melhoria 2)', () => {
  it('remove a foto da avaria: linha, arquivo e evento evidencia_removida', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    await armazenamento.salvar('evidencias/avaria.jpg', Readable.from([Buffer.from('x')]));
    const id = await criarEvidenciaTeste(db, {
      devolucaoId: d.id,
      itemId: d.itens[0],
      tipo: 'EXTRA',
      situacao: 'PRONTA',
      caminho: 'evidencias/avaria.jpg',
      provedor: 'memoria',
      sha256Original: 'c'.repeat(64),
    });
    const outra = await criarEvidenciaTeste(db, { devolucaoId: d.id, itemId: d.itens[0], tipo: 'EXTRA' });

    await removerFotoAvaria(db, id, operador);

    expect(await existe(id)).toBe(false);
    expect(await existe(outra)).toBe(true);
    expect(armazenamento.arquivos.has('evidencias/avaria.jpg')).toBe(false);
    const eventos = await db.select().from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_removida'));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ entidade: 'devolucao', entidadeId: d.id, usuarioId: operador.id });
    expect(eventos[0].dados).toMatchObject({ evidenciaId: id, tipo: 'EXTRA', itemId: d.itens[0], sha256_original: 'c'.repeat(64) });
  });

  it('não remove Fotos 1 a 4 nem o Vídeo de Prova (400)', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    for (const [tipo, itemId] of [
      ['FOTO_1_ETIQUETA', null],
      ['FOTO_3_PRODUTO', d.itens[0]],
      ['VIDEO_PROVA', null],
    ] as const) {
      const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo, itemId });
      await expect(removerFotoAvaria(db, id, operador)).rejects.toMatchObject({ status: 400, message: 'Só as fotos da avaria podem ser removidas.' });
      expect(await existe(id)).toBe(true);
    }
  });

  it('só quem está com a trava, durante a conferência (409); perfil sem operar_devolucoes (403); id inexistente (404)', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, itemId: d.itens[0], tipo: 'EXTRA' });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(removerFotoAvaria(db, id, outro)).rejects.toMatchObject({ status: 409, message: 'A conferência desta devolução não está aberta por você.' });
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(removerFotoAvaria(db, id, fiscal)).rejects.toMatchObject({ status: 403 });
    await expect(removerFotoAvaria(db, '00000000-0000-4000-8000-000000000000', operador)).rejects.toMatchObject({ status: 404 });
    await expect(removerFotoAvaria(db, 'nao-e-uuid', operador)).rejects.toMatchObject({ status: 404 });
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null }).where(eq(devolucoes.id, d.id));
    await expect(removerFotoAvaria(db, id, operador)).rejects.toMatchObject({ status: 409 });
    expect(await existe(id)).toBe(true);
    expect(await db.select().from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_removida'))).toHaveLength(0);
  });

  it('corrida com o worker: a foto fica PRONTA enquanto a remoção espera a trava; o arquivo final também é apagado', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, itemId: d.itens[0], tipo: 'EXTRA', situacao: 'PROCESSANDO' });
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    await armazenamento.salvar('evidencias/corrida.jpg', Readable.from([Buffer.from('x')]));

    let remocao: Promise<void> | undefined;
    // Outra conexão segura a devolução: a remoção lê a foto (ainda PROCESSANDO) e fica esperando a trava.
    await sql.begin(async (tx) => {
      await tx`select id from devolucoes where id = ${d.id} for update`;
      remocao = removerFotoAvaria(db, id, operador);
      for (let i = 0; i < 100; i++) {
        const [{ esperando }] = await sql`select count(*)::int as esperando from pg_locks where not granted`;
        if (esperando > 0) break;
        await new Promise((ok) => setTimeout(ok, 50));
      }
      // O "worker" conclui o processamento nesse intervalo.
      await tx`update evidencias set situacao_processamento = 'PRONTA', caminho = 'evidencias/corrida.jpg', provedor = 'memoria', sha256_final = ${'f'.repeat(64)} where id = ${id}`;
    });
    await remocao;

    expect(await existe(id)).toBe(false);
    expect(armazenamento.arquivos.has('evidencias/corrida.jpg')).toBe(false);
    const [evento] = await db.select().from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_removida'));
    expect(evento.dados).toMatchObject({ evidenciaId: id, sha256_final: 'f'.repeat(64) });
  });
});
