import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ErroMotivoIndisponivel } from '@/conectores/marketplace/mercadolivre/erros';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { MotivoItem } from '@/modules/devolucoes/dominio';
import { FilaMemoria } from '@/modules/fila/fila';
import { CONFIG_TAREFAS } from '@/modules/fila/tarefas';
import { listarEventos } from '@/modules/historico/eventos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ConectorMLMemoria, devolucaoMLConferidaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { contarContestacoes, enviarContestacao, listarContestacoes, obterContestacao, revisarEEnviar } from './contestacoes';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let conector: ConectorMLMemoria;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

/** Devolução do ML conferida com 1 item PROBLEMA, Foto 1 e Foto 3, e a contestação criada pela Tarefa 11. */
async function contestacaoTeste(p: { motivo?: MotivoItem; prazo?: Date } = {}) {
  const d = await devolucaoMLConferidaTeste(db, {
    itens: [{ destino: 'PROBLEMA', motivo: p.motivo ?? 'AVARIADO' }],
    externa: p.prazo ? { prazoConferencia: p.prazo } : {},
  });
  const foto1 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
  const foto3 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0].id });
  await processarResultadoConferencia(db, d.id, AGORA);
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, d.id));
  return { d, c, fotos: [foto1, foto3] };
}

async function contestacao(id: string) {
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.id, id));
  return c;
}
async function acoes(devolucaoId: string) {
  return (await listarEventos(db, 'devolucao', devolucaoId)).map((e) => e.acao);
}
const revisar = (id: string, mudancas: Partial<{ motivo: string; mensagem: string; evidencias: string[] }> = {}, fila = new FilaMemoria()) =>
  revisarEEnviar(db, fila, id, { motivo: 'SRF2', mensagem: 'Chegou quebrado, veja as fotos.', evidencias: [], ...mudancas }, gestor, AGORA);

describe('lista e detalhe (spec §6.6)', () => {
  it('cartões ordenados pelo prazo, com o selo, e a contagem por status', async () => {
    const tarde = await contestacaoTeste({ prazo: new Date('2026-11-25T00:00:00Z') });
    const cedo = await contestacaoTeste({ prazo: new Date('2026-11-13T00:00:00Z') });
    const lista = await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA);
    expect(lista.map((c) => c.id)).toEqual([cedo.c.id, tarde.c.id]);
    expect(lista[0]).toMatchObject({ codigo: cedo.d.codigo, motivo: 'SRF2', enviando: false, fotos: 2, selo: { tom: 'erro' } });
    expect(lista[1].selo).toMatchObject({ tom: 'atencao' });
    expect(await contarContestacoes(db)).toEqual({ AGUARDANDO_GESTOR: 2, ENVIADA: 0, FALHOU: 0 });
  });

  it('detalhe: itens com problema, fotos candidatas (nomes do PDF) e quais estão escolhidas', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'EXTRA' });
    await db.update(contestacoesCanal).set({ evidencias: [fotos[0].id] }).where(eq(contestacoesCanal.id, c.id));
    const detalhe = await obterContestacao(db, c.id, AGORA);
    expect(detalhe).toMatchObject({
      codigo: d.codigo,
      motivo: 'SRF2',
      status: 'AGUARDANDO_GESTOR',
      reclamacaoId: d.externa?.reclamacaoId,
      itensProblema: [{ unidade: 1, sku: 'SKU-ML-1', motivoTexto: 'Avariado' }],
    });
    expect(detalhe?.fotos.map((f) => [f.rotulo, f.selecionada])).toEqual([
      ['Foto 1', true],
      ['Foto 3 · unidade 1', false],
      ['Extra', false],
    ]);
    expect(await obterContestacao(db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('revisarEEnviar (o Gestor clica em "Enviar ao ML")', () => {
  it('grava a revisão, registra o evento e enfileira o envio; não deixa pedir de novo', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    const fila = new FilaMemoria();
    await revisar(c.id, { motivo: 'SRF4', mensagem: 'Veio outro modelo de fone.', evidencias: [fotos[1].id] }, fila);
    expect(await contestacao(c.id)).toMatchObject({
      motivoCanal: 'SRF4',
      mensagem: 'Veio outro modelo de fone.',
      evidencias: [fotos[1].id],
      status: 'AGUARDANDO_GESTOR',
      revisadoPor: gestor.id,
    });
    expect(fila.enviadas).toEqual([
      {
        nome: 'ml.enviar-contestacao',
        dados: { contestacaoId: c.id },
        opcoes: expect.objectContaining({ chaveUnica: expect.stringMatching(new RegExp(`^ml-contestacao-${c.id}-\\d+$`)) }),
      },
    ]);
    expect(await acoes(d.id)).toContain('contestacao_revisada');
    expect((await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA))[0].enviando).toBe(true);
    await expect(revisar(c.id, { evidencias: [fotos[1].id] })).rejects.toThrow('O envio já foi pedido');
  });

  it('recusa Operador, foto de outra devolução e SRF2 sem foto', async () => {
    const { c } = await contestacaoTeste();
    const outra = await contestacaoTeste();
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(revisarEEnviar(db, new FilaMemoria(), c.id, { motivo: 'SRF6', mensagem: 'Mensagem válida aqui.', evidencias: [] }, operador, AGORA)).rejects.toThrow(
      'Só o Gestor',
    );
    await expect(revisar(c.id, { evidencias: [outra.fotos[0].id] })).rejects.toThrow('não é desta devolução');
    await expect(revisar(c.id, { evidencias: [] })).rejects.toThrow('exige pelo menos 1 foto');
  });
});

describe('enviarContestacao (tarefa ml.enviar-contestacao)', () => {
  it('envia ao ML com as fotos lidas do armazenamento, na ordem escolhida: ENVIADA e evento', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: fotos.map((f) => f.id) });
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('enviada');
    expect(conector.enviados).toHaveLength(1);
    const { devolucaoExternaId, resultado } = conector.enviados[0];
    expect(devolucaoExternaId).toBe(d.externa?.devolucaoExternaId);
    if (resultado.tipo !== 'PROBLEMA') throw new Error('esperava PROBLEMA');
    expect(resultado).toMatchObject({ reclamacaoId: d.externa?.reclamacaoId, motivo: 'SRF2', mensagem: 'Chegou quebrado, veja as fotos.' });
    expect(resultado.anexos.map((a) => a.conteudo.toString())).toEqual(fotos.map((f) => f.conteudo.toString()));
    expect(resultado.anexos.map((a) => a.nome)).toEqual([`${d.codigo}-1.jpg`, `${d.codigo}-2.jpg`]);
    expect(await contestacao(c.id)).toMatchObject({ status: 'ENVIADA', enviadaEm: AGORA, erro: null });
    expect(await acoes(d.id)).toContain('contestacao_enviada');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('ignorada');
  });

  it('envio não pedido (sem revisão): ignorada', async () => {
    const { c } = await contestacaoTeste();
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('ignorada');
    expect(conector.enviados).toEqual([]);
  });

  it('foto ainda em processamento: tenta de novo; na última tentativa vira FALHOU', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    const processando = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: d.itens[0].id, situacao: 'PROCESSANDO' });
    await revisar(c.id, { evidencias: [fotos[0].id, processando.id] });
    await expect(enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).rejects.toThrow('processamento');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: true })).toBe('falhou');
    expect((await contestacao(c.id)).erro).toContain('sendo processadas');
  });

  it('o ML recusa (400): FALHOU com a mensagem; o Gestor revisa e envia de novo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { c, d, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroML(400, '{"message":"The return review is not available"}', '/x');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('falhou');
    expect(await contestacao(c.id)).toMatchObject({
      status: 'FALHOU',
      erro: 'O Mercado Livre recusou o envio: The return review is not available (HTTP 400)',
    });
    expect(await acoes(d.id)).toContain('contestacao_falhou');
    await revisar(c.id, { evidencias: [fotos[0].id] });
    expect(await contestacao(c.id)).toMatchObject({ status: 'AGUARDANDO_GESTOR', revisadoPor: gestor.id, erro: null });
  });

  it('motivo que o ML não aceita: FALHOU com a lista dos aceitos', async () => {
    const { c, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroMotivoIndisponivel('SRF2', ['SRF6']);
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('falhou');
    expect((await contestacao(c.id)).erro).toBe('O Mercado Livre não aceita o motivo SRF2 nesta devolução. Motivos aceitos: SRF6.');
  });

  it('ML fora do ar (503): lança; o manipulador, na última tentativa, deixa FALHOU', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { c, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroML(503, '', '/x');
    await expect(enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).rejects.toMatchObject({ status: 503 });
    const ultima = CONFIG_TAREFAS['ml.enviar-contestacao'].tentativas;
    await manipuladoresMercadoLivre['ml.enviar-contestacao']?.({ contestacaoId: c.id }, { db, fila: new FilaMemoria(), agora: AGORA, tentativa: ultima });
    expect((await contestacao(c.id)).status).toBe('FALHOU');
  });
});
