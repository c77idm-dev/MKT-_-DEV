import { describe, expect, it } from 'vitest';
import { lerFormularioLote } from './formulario';

const A = '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const B = '1c0a2d3f-4e5b-4c6d-9e7f-8a9b0c1d2e3f';
function form(campos: [string, string][]): FormData {
  const dados = new FormData();
  for (const [nome, valor] of campos) dados.append(nome, valor);
  return dados;
}

describe('lerFormularioLote (o FormData da tela do lote → pedido validado)', () => {
  it('fechar exige um dos 3 tipos', () => {
    expect(lerFormularioLote(form([['operacao', 'fechar'], ['tipo', 'TROCA']]))).toEqual({ pedido: { operacao: 'fechar', tipo: 'TROCA' } });
    expect(lerFormularioLote(form([['operacao', 'fechar']]))).toEqual({ erro: 'Escolha o tipo do lote: Conserto, Troca ou Garantia.' });
  });

  it('mover: itens repetidos viram uma lista sem repetição; destino novo exige o tipo; destino existente é um id', () => {
    expect(lerFormularioLote(form([['operacao', 'mover'], ['itens', A], ['itens', B], ['itens', A], ['destino', 'novo'], ['tipoNovo', 'GARANTIA']]))).toEqual({
      pedido: { operacao: 'mover', itemIds: [A, B], destino: { novo: 'GARANTIA' } },
    });
    expect(lerFormularioLote(form([['operacao', 'mover'], ['itens', A], ['destino', B]]))).toEqual({ pedido: { operacao: 'mover', itemIds: [A], destino: { loteId: B } } });
    expect(lerFormularioLote(form([['operacao', 'mover'], ['itens', A], ['destino', 'novo']]))).toEqual({ erro: 'Escolha o tipo do novo lote.' });
    expect(lerFormularioLote(form([['operacao', 'mover'], ['itens', A], ['destino', 'x']]))).toEqual({ erro: 'Escolha para onde mover.' });
    expect(lerFormularioLote(form([['operacao', 'mover'], ['itens', 'nao-e-id'], ['destino', B]]))).toEqual({ erro: 'Unidade inválida.' });
  });

  it('resultado: lê os campos resultado-<itemId> preenchidos e recusa id ou resultado inválido', () => {
    expect(lerFormularioLote(form([['operacao', 'resultado'], [`resultado-${A}`, 'CONSERTADO'], [`resultado-${B}`, '']]))).toEqual({
      pedido: { operacao: 'resultado', resultados: [{ itemId: A, resultado: 'CONSERTADO' }] },
    });
    expect(lerFormularioLote(form([['operacao', 'resultado'], [`resultado-${A}`, 'PERDIDO']]))).toEqual({ erro: 'Resultado inválido.' });
    expect(lerFormularioLote(form([['operacao', 'resultado'], ['resultado-xyz', 'TROCADO']]))).toEqual({ erro: 'Unidade inválida.' });
  });

  it('envio, cancelar e operação desconhecida', () => {
    expect(lerFormularioLote(form([['operacao', 'envio'], ['rastreio', ' BR1 ']]))).toEqual({ pedido: { operacao: 'envio', rastreio: ' BR1 ' } });
    expect(lerFormularioLote(form([['operacao', 'cancelar'], ['justificativa', 'Remessa para o fornecedor errado']]))).toEqual({
      pedido: { operacao: 'cancelar', justificativa: 'Remessa para o fornecedor errado' },
    });
    expect(lerFormularioLote(form([['operacao', 'apagar']]))).toEqual({ erro: 'Ação desconhecida.' });
  });
});
