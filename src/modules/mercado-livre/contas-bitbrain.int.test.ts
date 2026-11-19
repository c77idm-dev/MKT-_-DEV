import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ErroBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import { contasBitbrain } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configBitbrainTeste, contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import {
  atualizarContasBitbrain,
  buscarEAtualizarContas,
  contaAtrasada,
  contarContasIndisponiveis,
  contasParaVarrer,
  ErroContaBitbrain,
  listarContasBitbrain,
  marcarContaBitbrain,
  mensagemFalhaBitbrain,
} from './contas-bitbrain';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

describe('lista de contas pelo Bitbrain (§4.3)', () => {
  it('conta nova entra desmarcada e disponível; a que sumiu fica indisponível; a que volta fica disponível e mantém a marcação', async () => {
    await db.insert(contasBitbrain).values({ empresa: 'antiga', nome: 'Antiga', sellerId: '9', recebeDevolucoes: true });
    const r = await atualizarContasBitbrain(db, [{ empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' }], AGORA);
    expect(r).toEqual({ total: 1, novas: 1, indisponiveis: 1 });
    expect((await listarContasBitbrain(db)).map((c) => [c.empresa, c.recebeDevolucoes, c.disponivel])).toEqual([
      ['antiga', true, false],
      ['megadino', false, true],
    ]);
    await atualizarContasBitbrain(
      db,
      [
        { empresa: 'antiga', nome: 'Antiga Nova', sellerId: '9' },
        { empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' },
      ],
      AGORA,
    );
    const [antiga] = await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, 'antiga'));
    expect(antiga).toMatchObject({ nome: 'Antiga Nova', recebeDevolucoes: true, disponivel: true });
  });

  it('buscarEAtualizarContas lê o /empresas do Bitbrain falso', async () => {
    expect(await buscarEAtualizarContas(db, configBitbrainTeste(), AGORA)).toMatchObject({ total: 2, novas: 2 });
    expect((await listarContasBitbrain(db)).map((c) => c.nome)).toEqual(['Loja Falsa 1', 'Loja Falsa 2']);
  });

  it('token errado: ErroBitbrain com a mensagem do token e sem o valor dele; erro de rede: mensagem genérica', async () => {
    const erro = await buscarEAtualizarContas(db, configBitbrainTeste({ bitbrainToken: 'token-errado-secreto' }), AGORA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroBitbrain);
    expect(mensagemFalhaBitbrain(erro)).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
    expect(mensagemFalhaBitbrain(erro)).not.toContain('token-errado-secreto');
    expect(mensagemFalhaBitbrain(new TypeError('fetch failed'))).toBe('O Bitbrain não respondeu agora. Toque em "Atualizar contas" em alguns minutos.');
  });
});

describe('marcar a conta (só o Gestor, com evento)', () => {
  it('Gestor marca e desmarca; cada mudança gera um evento com o usuário; repetir não gera outro', async () => {
    await contasFalsasTeste(db);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, gestor, AGORA);
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, gestor, AGORA);
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: false }, gestor, AGORA);
    const eventos = await listarEventos(db, 'conta_bitbrain', 'loja-falsa-1');
    expect(eventos.map((e) => [e.acao, e.usuarioNome])).toEqual([
      ['ml_conta_bitbrain_marcada', gestor.nome],
      ['ml_conta_bitbrain_desmarcada', gestor.nome],
    ]);
    const [conta] = await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, 'loja-falsa-1'));
    expect(conta).toMatchObject({ recebeDevolucoes: false, atualizadaPor: gestor.id, atualizadaEm: AGORA });
  });

  it('Operador é recusado; conta que não existe é recusada', async () => {
    await contasFalsasTeste(db);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, operador, AGORA)).rejects.toBeInstanceOf(ErroContaBitbrain);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await expect(marcarContaBitbrain(db, { empresa: 'nao-existe', recebe: true }, gestor, AGORA)).rejects.toThrow('Conta não encontrada');
  });
});

describe('o que a varredura e os alertas usam', () => {
  it('contasParaVarrer: só marcadas e disponíveis; contarContasIndisponiveis: marcadas e indisponíveis', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-2'));
    expect((await contasParaVarrer(db)).map((c) => c.empresa)).toEqual(['loja-falsa-1']);
    expect(await contarContasIndisponiveis(db)).toBe(1);
  });

  it('contaAtrasada: marcada e disponível, mais de 1 h desde a última varredura (ou desde a marcação)', () => {
    const base = { recebeDevolucoes: true, disponivel: true, atualizadaEm: new Date('2026-11-18T14:30:00Z') };
    expect(contaAtrasada({ ...base, ultimaSincronizacaoEm: null }, AGORA)).toBe(false);
    expect(contaAtrasada({ ...base, ultimaSincronizacaoEm: new Date('2026-11-18T13:00:00Z') }, AGORA)).toBe(true);
    expect(contaAtrasada({ ...base, recebeDevolucoes: false, ultimaSincronizacaoEm: null, atualizadaEm: new Date('2026-11-18T10:00:00Z') }, AGORA)).toBe(false);
  });
});
