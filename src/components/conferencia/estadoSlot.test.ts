import { describe, expect, it } from 'vitest';
import type { EnvioConcluido, RegistroEnvio } from '@/components/midia/filaEnvios';
import { estadoDoSlot, evidenciasQueContam, textoDoSlot, type EvidenciaServidor } from './estadoSlot';

const VAGA = { tipo: 'FOTO_1_ETIQUETA' as const, itemId: null };

function envio(extra: Partial<RegistroEnvio>): RegistroEnvio {
  return {
    idCliente: 'c1', devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', nome: 'f.jpg', tipoConteudo: 'image/jpeg', tamanho: 3,
    arquivo: new Blob(['abc']), criadoEm: 1, tentativas: 0, proximaTentativaEm: 0, estado: 'pendente', uploadUrl: null, mensagem: null, progresso: 0,
    ...extra,
  };
}
const servidor = (extra: Partial<EvidenciaServidor>): EvidenciaServidor => ({ id: 'e1', tipo: 'FOTO_1_ETIQUETA', itemId: null, situacao: 'RECEBIDA', url: null, erro: null, ...extra });
const nada = { envios: [], concluidos: [], evidencias: [] };

describe('estadoDoSlot', () => {
  it('vazia, enviando com progresso, aguardando conexão e não enviada', () => {
    expect(estadoDoSlot(VAGA, nada)).toEqual({ tipo: 'vazio' });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'enviando', progresso: 0.4 })] })).toMatchObject({ tipo: 'enviando', progresso: 0.4 });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ tentativas: 2, mensagem: 'Sem conexão' })] })).toMatchObject({ tipo: 'aguardando', mensagem: 'Sem conexão' });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'erro', mensagem: 'Foto grande demais' })] })).toMatchObject({ tipo: 'nao_enviada', mensagem: 'Foto grande demais' });
  });

  it('o que está no aparelho vence o que o servidor já tem (refazer)', () => {
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'enviando' })], evidencias: [servidor({ situacao: 'PRONTA' })] }).tipo).toBe('enviando');
  });

  it('enviada: processando, pronta (com link) ou falhou no servidor', () => {
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({})] })).toEqual({ tipo: 'enviada', pronta: false, url: null });
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({ situacao: 'PRONTA', url: '/api/arquivos?c=x' })] })).toEqual({ tipo: 'enviada', pronta: true, url: '/api/arquivos?c=x' });
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({ situacao: 'FALHOU', erro: 'ffprobe falhou' })] })).toEqual({ tipo: 'falhou', mensagem: 'ffprobe falhou' });
  });

  it('confirmada nesta tela antes de o servidor mostrar: enviada', () => {
    const concluido: EnvioConcluido = { idCliente: 'c1', devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', evidenciaId: 'e2' };
    expect(estadoDoSlot(VAGA, { ...nada, concluidos: [concluido], evidencias: [servidor({ situacao: 'FALHOU' })] })).toEqual({ tipo: 'enviada', pronta: false, url: null });
  });

  it('textos da vaga', () => {
    expect(textoDoSlot({ tipo: 'vazio' })).toBe('Falta');
    expect(textoDoSlot({ tipo: 'enviando', progresso: 0.456, registro: envio({}) })).toBe('Enviando… 46%');
    expect(textoDoSlot({ tipo: 'enviada', pronta: false, url: null })).toBe('Enviada · processando');
    expect(textoDoSlot({ tipo: 'enviada', pronta: true, url: null })).toBe('Pronta');
  });

  it('para concluir contam as do servidor que não falharam e as confirmadas nesta tela', () => {
    const concluido: EnvioConcluido = { idCliente: 'c1', devolucaoId: 'd1', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', evidenciaId: 'e9' };
    expect(evidenciasQueContam([servidor({}), servidor({ tipo: 'FOTO_2_EMBALAGEM', situacao: 'FALHOU' })], [concluido])).toEqual([
      { tipo: 'FOTO_1_ETIQUETA', itemId: null },
      { tipo: 'FOTO_3_PRODUTO', itemId: 'i1' },
    ]);
  });
});
