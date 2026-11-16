import { describe, expect, it } from 'vitest';
import type { EnvioConcluido, RegistroEnvio } from '@/components/midia/filaEnvios';
import { estadoDoSlot, evidenciasQueContam, fotosExtras, textoDoSlot, type EvidenciaServidor } from './estadoSlot';

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

describe('fotosExtras (melhoria 2: fotos da avaria da unidade)', () => {
  const extraServidor = (id: string, extra: Partial<EvidenciaServidor> = {}) => servidor({ id, tipo: 'EXTRA', itemId: 'i1', ...extra });
  const extraLocal = (idCliente: string, extra: Partial<RegistroEnvio> = {}) => envio({ idCliente, tipo: 'EXTRA', itemId: 'i1', ...extra });
  const concluido = (idCliente: string, evidenciaId: string): EnvioConcluido => ({ idCliente, devolucaoId: 'd1', itemId: 'i1', tipo: 'EXTRA', evidenciaId });

  it('junta servidor, concluídas e aparelho, sem duplicar a concluída que o servidor já tem', () => {
    const fotos = fotosExtras(
      'i1',
      {
        evidencias: [extraServidor('e1', { situacao: 'PRONTA', url: '/u1' }), extraServidor('e2')],
        concluidos: [concluido('c2', 'e2'), concluido('c3', 'e3')],
        envios: [extraLocal('c5', { criadoEm: 5, estado: 'enviando', progresso: 0.5 }), extraLocal('c4', { criadoEm: 4, estado: 'erro', mensagem: 'Limite' })],
      },
      new Set(),
    );
    expect(fotos.map((f) => f.chave)).toEqual(['e1', 'e2', 'e3', 'c4', 'c5']);
    expect(fotos.map((f) => f.estado.tipo)).toEqual(['enviada', 'enviada', 'enviada', 'nao_enviada', 'enviando']);
    expect(fotos[0]).toMatchObject({ estado: { tipo: 'enviada', pronta: true, url: '/u1' }, alvo: { tipo: 'servidor', evidenciaId: 'e1' } });
    expect(fotos[2].alvo).toEqual({ tipo: 'servidor', evidenciaId: 'e3' });
    expect(fotos[3].alvo).toEqual({ tipo: 'local', idCliente: 'c4' });
  });

  it('esconde removidas, APAGADA, as de outra unidade e as que não são EXTRA', () => {
    const fotos = fotosExtras(
      'i1',
      {
        evidencias: [
          extraServidor('e1'),
          extraServidor('e2', { situacao: 'APAGADA' }),
          extraServidor('e3', { itemId: 'i2' }),
          servidor({ id: 'e4', tipo: 'FOTO_3_PRODUTO', itemId: 'i1' }),
          extraServidor('e5', { situacao: 'FALHOU', erro: 'carimbo falhou' }),
        ],
        concluidos: [concluido('c9', 'e9')],
        envios: [extraLocal('c7', { itemId: 'i2' }), envio({ idCliente: 'c8', tipo: 'FOTO_3_PRODUTO', itemId: 'i1' })],
      },
      new Set(['e1', 'e9']),
    );
    expect(fotos.map((f) => f.chave)).toEqual(['e5']);
    expect(fotos[0].estado).toEqual({ tipo: 'falhou', mensagem: 'carimbo falhou' });
  });
});
