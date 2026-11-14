/**
 * Contrato §7.3 (Fase 3, já com a 2 no main), com o ML falso (o fetch, não o conector):
 * aviso → devolução do ML → recepção (Fase 1) → conferência concluída pela Fase 2 (código real) →
 * todos BOM: "OK" ao ML; com PROBLEMA: contestação com as Fotos → "Enviar ao ML" sobe as fotos e manda a revisão.
 * O início da conferência é gravado direto. Também valeria `iniciarConferencia(db, id, usuario)` de `src/modules/conferencia/trava.ts`
 * (Fase 2; contrato §7.3, E11), mas a gravação direta não depende da trava.
 */
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchFalsoML, idReclamacaoFalsa } from '@/conectores/marketplace/mercadolivre/falso';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal, devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste, contaMLTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { revisarEEnviar } from './contestacoes';
import { criarConectorMLDaConta } from './fabrica-conector';
import { sincronizarReclamacao } from './tarefas';

const { db, sql } = criarDbTeste();
let fila: FilaMemoria;
let chamadas: string[];

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  chamadas = [];
  const config = configMLTeste();
  await contaMLTeste(db, { config });
  const gravador: typeof fetch = async (entrada, init) => {
    chamadas.push(`${init?.method ?? 'GET'} ${new URL(String(entrada)).pathname}`);
    return fetchFalsoML(entrada, init);
  };
  definirConectorParaTestes('MERCADO_LIVRE', await criarConectorMLDaConta(db, { config, fetchFn: gravador }));
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  definirFilaParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

const ctx = () => ({ db, fila, agora: new Date(), tentativa: 1 });

async function conferidaPelaFase2(destino: 'BOM' | 'PROBLEMA'): Promise<{ devolucaoId: string; gestor: UsuarioSessao }> {
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  const r = await sincronizarReclamacao(db, fila, idReclamacaoFalsa(1), new Date());
  if (!r || !('devolucaoId' in r)) throw new Error('a sincronização não criou a devolução');
  const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, r.devolucaoId));
  expect(await receberPorRastreio(db, d.rastreio ?? '', operador)).toMatchObject({ tipo: 'recebidas' });
  await db.update(devolucoes).set({ status: 'EM_CONFERENCIA', conferenteId: operador.id, conferenciaIniciadaEm: new Date() }).where(eq(devolucoes.id, d.id));
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA' });
  for (const item of await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id))) {
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: item.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: item.id });
    await db.update(itensDevolucao).set({ destino, motivo: destino === 'PROBLEMA' ? 'AVARIADO' : null }).where(eq(itensDevolucao.id, item.id));
  }
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  expect(await concluirConferencia(db, d.id, operador)).toEqual({ status: 'AGUARDANDO_NF' });
  expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'ml.enviar-resultado', dados: { devolucaoId: d.id } })]);
  return { devolucaoId: d.id, gestor: await criarUsuarioTeste(db, 'GESTOR') };
}

describe('Fase 2 → Fase 3 (contrato §5.4 e §7.3)', () => {
  it('todos BOM: a conferência real manda ml.enviar-resultado e o "OK" chega ao ML', async () => {
    const { devolucaoId } = await conferidaPelaFase2('BOM');
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId }, ctx());
    expect(chamadas.filter((c) => /^POST \/post-purchase\/v1\/returns\/\d+\/return-review$/.test(c))).toHaveLength(1);
    expect(chamadas.some((c) => c.endsWith('/returns/attachments'))).toBe(false);
  });

  it('com PROBLEMA: contestação AGUARDANDO_GESTOR com as Fotos; "Enviar ao ML" sobe as fotos e manda a revisão', async () => {
    const { devolucaoId, gestor } = await conferidaPelaFase2('PROBLEMA');
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId }, ctx());
    const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, devolucaoId));
    expect(c).toMatchObject({ status: 'AGUARDANDO_GESTOR', motivoCanal: 'SRF2' });
    expect(c.evidencias).toHaveLength(4); // Fotos 1, 2, 3 e 4; o Vídeo de Prova não vai ao ML
    await revisarEEnviar(db, fila, c.id, { motivo: 'SRF2', mensagem: c.mensagem, evidencias: c.evidencias }, gestor, new Date());
    await manipuladoresMercadoLivre['ml.enviar-contestacao']?.({ contestacaoId: c.id }, ctx());
    expect(chamadas.filter((x) => x.endsWith('/returns/attachments'))).toHaveLength(4);
    const [enviada] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.id, c.id));
    expect(enviada.status).toBe('ENVIADA');
  });
});
