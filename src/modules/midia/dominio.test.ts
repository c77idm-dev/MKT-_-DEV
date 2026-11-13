import { describe, expect, it } from 'vitest';
import {
  EVIDENCIAS_DO_ITEM,
  EVIDENCIAS_DO_PACOTE,
  ROTULO_EVIDENCIA,
  SITUACOES_PROCESSAMENTO,
  TIPOS_EVIDENCIA,
  ehFoto,
  ehTipoEvidencia,
} from './dominio';

describe('vocabulário das evidências (nomes do PDF)', () => {
  it('Fotos 1 a 4, Vídeo de Prova e Extra', () => {
    expect(TIPOS_EVIDENCIA.map((t) => ROTULO_EVIDENCIA[t])).toEqual(['Foto 1', 'Foto 2', 'Foto 3', 'Foto 4', 'Vídeo de Prova', 'Extra']);
  });

  it('Fotos 1 e 2 são do pacote; Fotos 3 e 4 são de cada unidade (spec §3)', () => {
    expect(EVIDENCIAS_DO_PACOTE).toEqual(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM']);
    expect(EVIDENCIAS_DO_ITEM).toEqual(['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL']);
  });

  it('verificações', () => {
    expect(ehTipoEvidencia('VIDEO_PROVA')).toBe(true);
    expect(ehTipoEvidencia('FOTO_9')).toBe(false);
    expect(ehFoto('FOTO_4_CODIGO_SERIAL')).toBe(true);
    expect(ehFoto('VIDEO_PROVA')).toBe(false);
    expect(SITUACOES_PROCESSAMENTO).toEqual(['RECEBIDA', 'PROCESSANDO', 'PRONTA', 'FALHOU', 'APAGADA']);
  });
});
