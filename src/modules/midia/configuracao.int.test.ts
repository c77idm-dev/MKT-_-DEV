import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, eventosHistorico } from '@/db/schema';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { salvarConfiguracaoMidia } from './configuracao';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('salvarConfiguracaoMidia (contrato §5.6)', () => {
  it('cria a linha 1 ou atualiza só os campos da Fase 2, e registra no histórico', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await db.insert(configuracoes).values({ id: 1, razaoSocial: 'Empresa Ltda' }); // campo da Fase 4
    const agora = new Date('2026-11-12T20:00:00Z');
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 }, gestor, agora);
    expect(await lerConfiguracao(db)).toMatchObject({
      razaoSocial: 'Empresa Ltda',
      videoObrigatorio: 'SO_PROBLEMA',
      mesesRetencaoMidia: 6,
      atualizadoPor: gestor.id,
      atualizadoEm: agora,
    });
    const [evento] = await db
      .select({ entidade: eventosHistorico.entidade, entidadeId: eventosHistorico.entidadeId, dados: eventosHistorico.dados })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'configuracao_alterada'));
    expect(evento).toEqual({
      entidade: 'configuracao',
      entidadeId: '1',
      dados: { area: 'conferencia_midias', antes: { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 12 }, depois: { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 } },
    });
  });

  it('funciona sem linha nenhuma e recusa quem não é Gestor', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 24 }, gestor);
    expect((await lerConfiguracao(db)).mesesRetencaoMidia).toBe(24);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 1 }, operador)).rejects.toThrow('Só o Gestor muda as Configurações.');
  });
});
