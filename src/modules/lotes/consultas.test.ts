import { describe, expect, it } from 'vitest';
import { hrefDaPaginaLotes, lerFiltrosLotes } from './consultas';

const F = '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

describe('lerFiltrosLotes (spec §6.5: por fornecedor e por status; §6.7: busca)', () => {
  it('aceita só id de fornecedor e status válidos, e a busca aparada', () => {
    expect(lerFiltrosLotes({ fornecedor: F, status: 'FECHADO', busca: '  SN-123 ' })).toEqual({ fornecedorId: F, status: 'FECHADO', busca: 'SN-123' });
    expect(lerFiltrosLotes({ fornecedor: "1' or 1=1", status: 'fechado', busca: '   ' })).toEqual({});
    expect(lerFiltrosLotes({ fornecedor: ['a', 'b'], status: undefined })).toEqual({});
    expect(lerFiltrosLotes({ busca: 'X'.repeat(80) }).busca).toHaveLength(60);
  });

  it('a paginação preserva os filtros', () => {
    expect(hrefDaPaginaLotes('/lotes', { fornecedorId: F, status: 'FECHADO', busca: 'DEV 1' }, 2)).toBe(`/lotes?fornecedor=${F}&status=FECHADO&busca=DEV+1&pagina=2`);
    expect(hrefDaPaginaLotes('/fluxo/etapa/5', {}, 1)).toBe('/fluxo/etapa/5');
  });
});
