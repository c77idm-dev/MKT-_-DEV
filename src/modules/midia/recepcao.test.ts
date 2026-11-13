import { describe, expect, it } from 'vitest';
import { lerMetadados } from './recepcao';

const ID = '11111111-1111-4111-8111-111111111111';
const DEV = '22222222-2222-4222-8222-222222222222';

describe('lerMetadados (o que o celular manda no Upload-Metadata)', () => {
  it('lê os campos e transforma itemId vazio em null', () => {
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'IMAGE/JPEG', nome: 'foto-1.jpg' })).toEqual({
      idCliente: ID,
      devolucaoId: DEV,
      itemId: null,
      tipo: 'FOTO_1_ETIQUETA',
      tipoConteudo: 'image/jpeg',
      nome: 'foto-1.jpg',
    });
  });

  it('explica o que está errado', () => {
    expect(lerMetadados(undefined)).toBe('Envio sem identificação.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: 'x', tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' })).toBe('Devolução inválida.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'FOTO_9', tipoConteudo: 'image/jpeg' })).toBe('Tipo de evidência inválido.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, itemId: 'x', tipo: 'FOTO_3_PRODUTO', tipoConteudo: 'image/jpeg' })).toBe('Unidade inválida.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'VIDEO_PROVA', tipoConteudo: '' })).toBe('Tipo do arquivo não informado.');
  });
});
