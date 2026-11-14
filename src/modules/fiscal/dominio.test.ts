import { describe, expect, it } from 'vitest';
import { dentroDoPrazoDeCancelamento, ehOperacao, ehTipoNota, prazoDeCancelamento, referenciaDaNota, rotulosDoEstoque } from './dominio';

describe('vocabulário fiscal', () => {
  it('a referência do emissor é o id sem hífens (só letras e números, contrato §4.3)', () => {
    expect(referenciaDaNota('0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4')).toBe('0b9f1c2e3d4a4b5c8d6e7f8091a2b3c4');
  });

  it('reconhece tipo de nota e operação', () => {
    expect(ehTipoNota('DEVOLUCAO_VENDA')).toBe(true);
    expect(ehTipoNota('VENDA')).toBe(false);
    expect(ehOperacao('FORA_ESTADO')).toBe(true);
    expect(ehOperacao('fora')).toBe(false);
  });

  it('prazo de cancelamento: 24 h depois da autorização', () => {
    const autorizada = new Date('2026-11-12T10:00:00Z');
    expect(prazoDeCancelamento(autorizada)).toEqual(new Date('2026-11-13T10:00:00Z'));
    expect(dentroDoPrazoDeCancelamento(autorizada, new Date('2026-11-13T09:59:59Z'))).toBe(true);
    expect(dentroDoPrazoDeCancelamento(autorizada, new Date('2026-11-13T10:00:00Z'))).toBe(false);
  });

  it('as abas da etapa 4 têm os nomes do PDF (spec §6.4)', () => {
    expect(rotulosDoEstoque()).toEqual(['Estoque Bom', 'Estoque Problema']);
  });
});
