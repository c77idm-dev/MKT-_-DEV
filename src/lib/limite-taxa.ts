export type Limitador = { permitir(chave: string, agoraMs?: number): boolean; tamanho(): number };

/** Janela fixa por chave, em memória (um processo web). Para endpoints públicos (pendência da Fase 0). */
export function criarLimitador(p: { maximo: number; janelaMs: number; maxChaves?: number }): Limitador {
  const janelas = new Map<string, { inicio: number; contagem: number }>();
  const maxChaves = p.maxChaves ?? 10_000;
  return {
    permitir(chave: string, agoraMs: number = Date.now()): boolean {
      const atual = janelas.get(chave);
      if (atual && agoraMs - atual.inicio < p.janelaMs) {
        atual.contagem += 1;
        return atual.contagem <= p.maximo;
      }
      if (!atual && janelas.size >= maxChaves) {
        for (const [k, v] of janelas) if (agoraMs - v.inicio >= p.janelaMs) janelas.delete(k);
        // Proteção de memória: se nada venceu, recomeça do zero.
        if (janelas.size >= maxChaves) janelas.clear();
      }
      janelas.set(chave, { inicio: agoraMs, contagem: 1 });
      return true;
    },
    tamanho: () => janelas.size,
  };
}

/** IP de quem chamou: o último endereço do X-Forwarded-For é o que o nginx da VPS viu (o cliente não forja esse). */
export function ipDaRequisicao(cabecalhos: Headers): string {
  const lista = (cabecalhos.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.at(-1) ?? cabecalhos.get('x-real-ip') ?? 'desconhecido';
}
