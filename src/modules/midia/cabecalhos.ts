const EXIBIVEIS_NO_NAVEGADOR = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']);

/** Cabeçalhos de segurança e de cache da rota /api/arquivos. XML e tipos desconhecidos nunca abrem na origem do app. */
export function cabecalhosDoArquivo(tipoConteudo: string, segundosRestantes: number): Record<string, string> {
  return {
    'content-type': tipoConteudo,
    'content-disposition': EXIBIVEIS_NO_NAVEGADOR.has(tipoConteudo) ? 'inline' : 'attachment',
    'content-security-policy': "sandbox; default-src 'none'",
    'x-content-type-options': 'nosniff',
    // Celulares compartilhados: nada de cache, exceto vídeo (o Range precisa dele).
    'cache-control': tipoConteudo.startsWith('video/') ? `private, max-age=${segundosRestantes}` : 'private, no-store',
  };
}
