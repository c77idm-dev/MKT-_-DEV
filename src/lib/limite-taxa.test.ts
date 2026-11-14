import { describe, expect, it } from 'vitest';
import { criarLimitador, ipDaRequisicao } from './limite-taxa';

describe('criarLimitador', () => {
  it('deixa passar até o máximo na janela e recusa o resto; cada chave tem a sua conta', () => {
    const limitador = criarLimitador({ maximo: 2, janelaMs: 1000 });
    expect([limitador.permitir('a', 0), limitador.permitir('a', 10), limitador.permitir('a', 20)]).toEqual([true, true, false]);
    expect(limitador.permitir('b', 20)).toBe(true);
  });

  it('a janela recomeça depois do tempo', () => {
    const limitador = criarLimitador({ maximo: 1, janelaMs: 1000 });
    expect(limitador.permitir('a', 0)).toBe(true);
    expect(limitador.permitir('a', 999)).toBe(false);
    expect(limitador.permitir('a', 1000)).toBe(true);
  });

  it('não cresce sem limite: limpa as janelas vencidas', () => {
    const limitador = criarLimitador({ maximo: 1, janelaMs: 1000, maxChaves: 2 });
    limitador.permitir('a', 0);
    limitador.permitir('b', 0);
    expect(limitador.permitir('c', 2000)).toBe(true);
    expect(limitador.tamanho()).toBeLessThanOrEqual(2);
  });
});

describe('ipDaRequisicao', () => {
  it('usa o último endereço do X-Forwarded-For (o que o nginx da VPS viu)', () => {
    expect(ipDaRequisicao(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2');
    expect(ipDaRequisicao(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(ipDaRequisicao(new Headers())).toBe('desconhecido');
  });
});
