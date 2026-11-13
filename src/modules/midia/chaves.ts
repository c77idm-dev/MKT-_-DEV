import { ErroChaveInvalida } from './erros';

/** Segmentos começam por letra ou número e só têm letras, números, ponto, hífen e sublinhado: sem "..", sem barra inicial. */
const CHAVE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function validarChave(chave: string): void {
  if (chave.length === 0 || chave.length > 300 || !CHAVE_VALIDA.test(chave)) throw new ErroChaveInvalida(chave);
}

/** Contrato §5.2. O nome do arquivo que veio do celular nunca entra na chave. */
export function chaveEvidencia(devolucaoId: string, evidenciaId: string, extensao: 'jpg' | 'mp4'): string {
  return `evidencias/${devolucaoId}/${evidenciaId}.${extensao}`;
}

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  xml: 'application/xml',
  pdf: 'application/pdf',
};

export function tipoConteudoPorExtensao(chave: string): string {
  const extensao = chave.split('.').pop()?.toLowerCase() ?? '';
  return TIPOS[extensao] ?? 'application/octet-stream';
}
