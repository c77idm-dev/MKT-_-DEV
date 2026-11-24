import type { Env } from '@/lib/env';

/** Um nome de host: rótulos de letras, números e hífen (sem começar nem terminar com hífen), separados por ponto. */
const NOME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** O que decide se o localhost vale: fora de produção, ou no e2e (build de produção com PERMITIR_FALSOS=1). */
export type AmbienteOrigem = Pick<Env, 'NODE_ENV' | 'PERMITIR_FALSOS'>;

/** Por que o pedido não deu um endereço público. Vai para o log sem o cabeçalho bruto. */
export type MotivoSemOrigem = 'host_invalido' | 'host_diferente_do_encaminhado' | 'sem_https' | 'localhost_em_producao';

export type OrigemAvaliada = { url: string } | { url: null; motivo: MotivoSemOrigem };

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
 * O endereço público do sistema ("https://dominio"), tirado do pedido que gera o dossiê, para os links do PDF (E28),
 * ou o motivo de não haver um.
 *
 * Na VPS o app só escuta em 127.0.0.1:3020 e todo pedido passa pelo nginx (docker/nginx/devolucoes.conf), que manda
 * `Host $host` e `X-Forwarded-Host $host` (o domínio do bloco do sistema: um Host desconhecido cai em outro site da VPS
 * e nem chega aqui) e `X-Forwarded-Proto $scheme` (https depois do certbot; o http só redireciona). Mesmo assim o Host
 * não é usado às cegas:
 * - precisa ser um nome de host válido, com porta opcional (nada de caminho, usuário, "?" ou "#");
 * - quando o X-Forwarded-Host vem, precisa ser igual ao Host;
 * - o localhost (localhost, 127.0.0.1 e [::1]) só vale fora de produção ou no e2e (PERMITIR_FALSOS=1). Em produção
 *   ele é o acesso direto ao app (por exemplo, um túnel SSH até 127.0.0.1:3020), e quem recebe o PDF não o abre;
 * - o protocolo é o 1º valor do X-Forwarded-Proto e precisa ser https. Sem ele, ou com http, só vale no localhost.
 * Fora disso, null: o PDF sai sem os links (nunca um link para um endereço que não é o do sistema).
 */
export function avaliarOrigemPublica(cabecalhos: Headers, ambiente: AmbienteOrigem): OrigemAvaliada {
  const host = hostValido(cabecalhos.get('host'));
  if (!host) return { url: null, motivo: 'host_invalido' };
  const encaminhado = cabecalhos.get('x-forwarded-host');
  if (encaminhado !== null && encaminhado.trim().toLowerCase() !== host.host) return { url: null, motivo: 'host_diferente_do_encaminhado' };
  const local = LOCAIS.has(host.nome);
  if (local && ambiente.NODE_ENV === 'production' && ambiente.PERMITIR_FALSOS !== '1') return { url: null, motivo: 'localhost_em_producao' };
  const protocolo = (cabecalhos.get('x-forwarded-proto') ?? 'http').split(',')[0].trim().toLowerCase();
  if (protocolo === 'https') return { url: `https://${host.host}` };
  if (protocolo === 'http' && local) return { url: `http://${host.host}` };
  return { url: null, motivo: 'sem_https' };
}

/** Só o endereço (avaliarOrigemPublica), ou null. */
export function origemPublica(cabecalhos: Headers, ambiente: AmbienteOrigem): string | null {
  return avaliarOrigemPublica(cabecalhos, ambiente).url;
}
