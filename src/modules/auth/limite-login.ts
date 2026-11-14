export const MAX_FALHAS_POR_IP = 20;
export const JANELA_IP_MS = 15 * 60 * 1000;
export const MENSAGEM_LIMITE_IP = 'Muitas tentativas de entrar a partir desta rede. Tente de novo em 15 minutos.';

const MAX_CHAVES_PADRAO = 10_000;

export type LimiteLogin = {
  bloqueado(ip: string, agoraMs?: number): boolean;
  registrarFalha(ip: string, agoraMs?: number): void;
  limpar(): void;
  tamanho(): number;
};

/** IPv4 e textos que não são IP ficam como estão; IPv6 vira o prefixo /64, em minúsculas. */
export function chaveDoIp(ip: string): string {
  if (!ip.includes(':')) return ip;
  const texto = ip.toLowerCase().split('%')[0];
  const partes = texto.split('::');
  if (partes.length > 2) return ip;
  const grupos = (s: string) => (s === '' ? [] : s.split(':'));
  const antes = grupos(partes[0]);
  const depois = partes.length === 2 ? grupos(partes[1]) : [];
  const todos =
    partes.length === 2
      ? [...antes, ...Array<string>(Math.max(0, 8 - antes.length - depois.length)).fill('0'), ...depois]
      : antes;
  if (todos.length < 4 || !todos.slice(0, 4).every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return todos.slice(0, 4).join(':');
}

type Janela = { inicio: number; falhas: number };

export function criarLimiteLogin(
  p: { maximo?: number; janelaMs?: number; maxChaves?: number } = {},
): LimiteLogin {
  const maximo = p.maximo ?? MAX_FALHAS_POR_IP;
  const janelaMs = p.janelaMs ?? JANELA_IP_MS;
  const maxChaves = p.maxChaves ?? MAX_CHAVES_PADRAO;
  const mapa = new Map<string, Janela>();
  const vencida = (j: Janela, agora: number) => agora - j.inicio >= janelaMs;

  return {
    bloqueado(ip, agoraMs = Date.now()) {
      const j = mapa.get(chaveDoIp(ip));
      return !!j && !vencida(j, agoraMs) && j.falhas >= maximo;
    },
    registrarFalha(ip, agoraMs = Date.now()) {
      const chave = chaveDoIp(ip);
      const atual = mapa.get(chave);
      if (atual && !vencida(atual, agoraMs)) {
        atual.falhas += 1;
        return;
      }
      mapa.delete(chave);
      if (mapa.size >= maxChaves) {
        for (const [k, j] of mapa) if (vencida(j, agoraMs)) mapa.delete(k);
        // O Map guarda a ordem de inserção: as primeiras chaves são as mais antigas.
        for (const k of mapa.keys()) {
          if (mapa.size < maxChaves) break;
          mapa.delete(k);
        }
      }
      mapa.set(chave, { inicio: agoraMs, falhas: 1 });
    },
    limpar() {
      mapa.clear();
    },
    tamanho() {
      return mapa.size;
    },
  };
}

const CHAVE_GLOBAL = Symbol.for('devolucoes.limiteLoginPadrao');

/** Um só por processo (globalThis, para o recarregamento do `next dev`). */
export function limiteLoginPadrao(): LimiteLogin {
  const g = globalThis as unknown as Record<symbol, LimiteLogin | undefined>;
  return (g[CHAVE_GLOBAL] ??= criarLimiteLogin());
}
