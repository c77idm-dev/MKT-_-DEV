// Cabeçalhos de segurança (spec §10; decisão 15). Sem imports: o next.config.ts importa este arquivo por caminho relativo.

export function politicaDeConteudo(p: { desenvolvimento: boolean }): string {
  // O next dev usa eval para o hot reload; em produção não.
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(p.desenvolvimento ? ["'unsafe-eval'"] : [])];
  // Sem `upgrade-insecure-requests` de propósito: o HTTPS é do nginx e o e2e roda em http://localhost.
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://auth.mercadolivre.com.br",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function cabecalhosDeSeguranca(p: { desenvolvimento: boolean }): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
    ...(p.desenvolvimento ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
    { key: 'Content-Security-Policy', value: politicaDeConteudo(p) },
  ];
}
