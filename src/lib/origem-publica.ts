/** Um nome de host: rótulos de letras, números e hífen (sem começar nem terminar com hífen), separados por ponto. */
const NOME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** "host" ou "host:porta", em minúsculas; null para qualquer outra coisa (caminho, usuário, espaço, porta inválida). */
function hostValido(bruto: string | null): { host: string; nome: string } | null {
  if (!bruto) return null;
  const host = bruto.trim().toLowerCase();
  const m = /^(\[::1\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(host);
  if (!m) return null;
  const [, nome, porta] = m;
  if (nome !== '[::1]' && !NOME.test(nome)) return null;
  if (porta !== undefined && (Number(porta) < 1 || Number(porta) > 65535)) return null;
  return { host, nome };
}

/**
 * O endereço público do sistema ("https://dominio"), tirado do pedido que gera o dossiê, para os links do PDF (E28).
 *
 * Na VPS o app só escuta em 127.0.0.1:3020 e todo pedido passa pelo nginx (docker/nginx/devolucoes.conf), que manda
 * `Host $host` e `X-Forwarded-Host $host` (o domínio do bloco do sistema: um Host desconhecido cai em outro site da VPS
 * e nem chega aqui) e `X-Forwarded-Proto $scheme` (https depois do certbot; o http só redireciona). Mesmo assim o Host
 * não é usado às cegas:
 * - precisa ser um nome de host válido, com porta opcional (nada de caminho, usuário, "?" ou "#");
 * - quando o X-Forwarded-Host vem, precisa ser igual ao Host;
 * - o protocolo é o 1º valor do X-Forwarded-Proto e precisa ser https. Sem ele, ou com http, só vale no próprio
 *   computador (localhost, 127.0.0.1 e [::1]: o e2e e o desenvolvimento, sem nginx).
 * Fora disso, null: o PDF sai sem os links (nunca um link para um endereço que não é o do sistema).
 */
export function origemPublica(cabecalhos: Headers): string | null {
  const host = hostValido(cabecalhos.get('host'));
  if (!host) return null;
  const encaminhado = cabecalhos.get('x-forwarded-host');
  if (encaminhado !== null && encaminhado.trim().toLowerCase() !== host.host) return null;
  const protocolo = (cabecalhos.get('x-forwarded-proto') ?? 'http').split(',')[0].trim().toLowerCase();
  if (protocolo === 'https') return `https://${host.host}`;
  if (protocolo === 'http' && LOCAIS.has(host.nome)) return `http://${host.host}`;
  return null;
}
