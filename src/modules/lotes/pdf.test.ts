import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ListaConsolidada } from './lista-consolidada';
import { gerarPdfLista, paraWinAnsi } from './pdf';

function lista(linhas: number, observacao = 'Tela trincada'): ListaConsolidada {
  return {
    lote: { codigo: 'LOT-000045', tipo: 'Conserto' },
    fornecedor: { razaoSocial: 'Fornecedor Remessa Ltda', cnpj: '11.222.333/0001-81', contatoSac: 'SAC Teste', emailSac: 'sac@fornecedor.teste' },
    nota: { numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: '14/11/2026 10:00' },
    geradaEm: '14/11/2026 10:05',
    linhas: Array.from({ length: linhas }, (_, i) => ({
      devolucao: `DEV-${String(i + 1).padStart(6, '0')}`, unidade: 1, sku: 'FONE-01', descricao: 'Fone Bluetooth com nome bem comprido para quebrar a linha da tabela',
      serial: `SN-${i}`, motivo: 'Avariado', observacao,
    })),
  };
}

describe('PDF da lista consolidada', () => {
  it('gera um PDF com título, e quebra a tabela em várias páginas', async () => {
    const bytes = await gerarPdfLista(lista(80));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Lista consolidada LOT-000045');
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('caractere fora do WinAnsi vira "?" em vez de erro (decisão 22)', async () => {
    expect(paraWinAnsi('Peça ✓ ok 😀 “aspas”')).toBe('Peça ? ok ? “aspas”');
    await expect(gerarPdfLista(lista(1, 'Caixa amassada 📦'))).resolves.toBeInstanceOf(Uint8Array);
  });
});
