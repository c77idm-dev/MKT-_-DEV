import { describe, expect, it } from 'vitest';
import { chaveValida } from '@/modules/fiscal/chave';
import { notaTeste } from '../../../tests/helpers/nota-teste';
import { EmissorFalso } from './falso';

describe('EmissorFalso (contrato §5.3)', () => {
  it('autoriza na 2ª consulta, com chave válida, série 1, XML e DANFE', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste();
    expect(await emissor.emitir(nota)).toEqual({ referencia: nota.referencia });
    expect(await emissor.consultar(nota.referencia)).toEqual({ situacao: 'PROCESSANDO' });
    const autorizada = await emissor.consultar(nota.referencia);
    if (autorizada.situacao !== 'AUTORIZADA') throw new Error(`esperava AUTORIZADA, veio ${autorizada.situacao}`);
    expect(chaveValida(autorizada.chave)).toBe(true);
    expect(autorizada.chave.slice(6, 20)).toBe('11444777000161');
    expect(autorizada.serie).toBe('1');
    expect((await emissor.baixar(autorizada.urlXml)).toString('utf8')).toContain(`<chNFe>${autorizada.chave}</chNFe>`);
    expect((await emissor.baixar(autorizada.urlDanfe)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('rejeita quando a natureza contém REJEITAR; corrigida, o mesmo ref é reenviado e autorizado', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste({ naturezaOperacao: 'Devolucao de venda REJEITAR' });
    await emissor.emitir(nota);
    expect(await emissor.consultar(nota.referencia)).toEqual({
      situacao: 'REJEITADA',
      codigo: '999',
      motivo: 'Rejeição simulada: a natureza da operação contém REJEITAR',
    });
    await emissor.emitir({ ...nota, naturezaOperacao: 'Devolucao de venda' });
    await emissor.consultar(nota.referencia);
    expect((await emissor.consultar(nota.referencia)).situacao).toBe('AUTORIZADA');
  });

  it('cancela (a consulta passa a dizer CANCELADA) e recusa quando a justificativa contém RECUSAR', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste();
    await emissor.emitir(nota);
    await emissor.consultar(nota.referencia);
    await emissor.consultar(nota.referencia);
    expect(await emissor.cancelar(nota.referencia, 'Teste RECUSAR cancelamento')).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Cancelamento recusado (simulação): a justificativa contém RECUSAR',
    });
    const cancelada = await emissor.cancelar(nota.referencia, 'Cliente desistiu da devolução');
    expect(cancelada).toEqual({ situacao: 'CANCELADA', urlXmlCancelamento: expect.stringMatching(/^falso:\/\/cancelamento\//) });
    expect(await emissor.consultar(nota.referencia)).toEqual(cancelada);
    if (cancelada.situacao === 'CANCELADA' && cancelada.urlXmlCancelamento) {
      expect((await emissor.baixar(cancelada.urlXmlCancelamento)).toString('utf8')).toContain('<tpEvento>110111</tpEvento>');
    }
  });

  it('o cancelamento funciona sem estado (roda no servidor web, quem emitiu foi o worker)', async () => {
    expect(await new EmissorFalso().cancelar('abc123', 'Cliente desistiu da devolução')).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: 'falso://cancelamento/abc123',
    });
  });

  it('nota desconhecida vira rejeição; reenviar uma autorizada não muda nada; endereço estranho é recusado', async () => {
    const emissor = new EmissorFalso();
    expect((await emissor.consultar('naoexiste')).situacao).toBe('REJEITADA');
    const nota = notaTeste();
    await emissor.emitir(nota);
    await emissor.consultar(nota.referencia);
    const autorizada = await emissor.consultar(nota.referencia);
    await emissor.emitir(nota);
    expect(await emissor.consultar(nota.referencia)).toEqual(autorizada);
    await expect(emissor.baixar('https://exemplo.com/x')).rejects.toThrow('Endereço desconhecido no emissor simulado');
  });
});
