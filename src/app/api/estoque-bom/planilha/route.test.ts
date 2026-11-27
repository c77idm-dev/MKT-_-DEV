import { readSheet } from 'read-excel-file/universal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paraArrayBuffer } from '../../../../../tests/helpers/xlsx';

const exigirPermissao = vi.hoisted(() => vi.fn(async () => ({ id: 'u1', perfil: 'FISCAL' })));
const listarVoltaAoArmazem = vi.hoisted(() => vi.fn());
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao }));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/volta-armazem/consulta', () => ({ listarVoltaAoArmazem }));

import { GET } from './route';

beforeEach(() => {
  exigirPermissao.mockClear();
  listarVoltaAoArmazem.mockReset();
});

describe('GET /api/estoque-bom/planilha (melhoria 4)', () => {
  it('pede acompanhar (E29: o Operador não baixa a planilha) e baixa o xlsx com o nome do período', async () => {
    listarVoltaAoArmazem.mockResolvedValue([
      {
        chave: 'i1',
        tipo: 'DEVOLUCAO',
        data: new Date('2026-11-16T17:32:00Z'),
        origem: 'DEV-000123',
        sku: 'SKU-1',
        descricao: 'Fone',
        ean: null,
        quantidade: 1,
        situacao: 'Aguardando NF',
        serial: null,
      },
    ]);
    const resposta = await GET(new Request('http://localhost/api/estoque-bom/planilha?de=2026-11-01&ate=2026-11-16'));
    expect(exigirPermissao).toHaveBeenCalledWith('acompanhar');
    expect(listarVoltaAoArmazem).toHaveBeenCalledWith({}, { de: '2026-11-01', ate: '2026-11-16' });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resposta.headers.get('content-disposition')).toBe('attachment; filename="volta-ao-armazem_2026-11-01_a_2026-11-16.xlsx"');
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    const linhas = await readSheet(await resposta.arrayBuffer().then((b) => paraArrayBuffer(new Uint8Array(b))));
    expect(linhas[1].slice(0, 2)).toEqual(['Período', '01/11/2026 a 16/11/2026']);
    expect(linhas[4].slice(0, 3)).toEqual(['16/11/2026 14:32', 'DEV-000123', 'SKU-1']);
  });

  it('período inválido não baixa: volta para a página com o mesmo período', async () => {
    const resposta = await GET(new Request('http://localhost/api/estoque-bom/planilha?de=2026-11-17&ate=2026-11-16'));
    expect(exigirPermissao).toHaveBeenCalledWith('acompanhar');
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('location')).toBe('/fluxo/estoque-bom?de=2026-11-17&ate=2026-11-16');
    expect(listarVoltaAoArmazem).not.toHaveBeenCalled();
  });

  it('sem período na URL baixa o de hoje', async () => {
    listarVoltaAoArmazem.mockResolvedValue([]);
    const resposta = await GET(new Request('http://localhost/api/estoque-bom/planilha'));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-disposition')).toMatch(/^attachment; filename="volta-ao-armazem_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.xlsx"$/);
  });
});
