import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { devolucaoComProvasTeste } from '../../../tests/helpers/fabricas-dossie-banco';
import { linkDoVideoDeProva } from './video';

const { db, sql } = criarDbTeste();

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('linkDoVideoDeProva ("Baixar vídeo" do Responda no ML, extra)', () => {
  it('vídeo pronto: link temporário (10 min) no provedor dele', async () => {
    const p = await devolucaoComProvasTeste(db);
    expect(await linkDoVideoDeProva(db, p.id)).toBe(`memoria://${p.evidencias.video.caminho}?expira=600`);
  });

  it('sem vídeo, ou vídeo que não ficou pronto: null', async () => {
    const operador = await criarUsuarioTeste(db);
    const sem = await criarDevolucaoChegada(db, operador);
    expect(await linkDoVideoDeProva(db, sem.id)).toBeNull();
    const processando = await criarDevolucaoChegada(db, operador);
    await criarEvidenciaTeste(db, { devolucaoId: processando.id, tipo: 'VIDEO_PROVA', situacao: 'PROCESSANDO' });
    expect(await linkDoVideoDeProva(db, processando.id)).toBeNull();
    expect(await linkDoVideoDeProva(db, 'não é uuid')).toBeNull();
  });
});
