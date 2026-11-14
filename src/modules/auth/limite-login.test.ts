import { describe, expect, it } from 'vitest';
import { chaveDoIp, criarLimiteLogin, JANELA_IP_MS } from './limite-login';

describe('limite de login por IP (spec §10; decisão 14)', () => {
  it('bloqueia o IP depois de 20 falhas em 15 minutos; outro IP segue livre', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) {
      expect(l.bloqueado('9.9.9.9', 0)).toBe(false);
      l.registrarFalha('9.9.9.9', 0);
    }
    expect(l.bloqueado('9.9.9.9', 1000)).toBe(true);
    expect(l.bloqueado('8.8.8.8', 1000)).toBe(false);
  });

  it('libera quando a janela passa', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) l.registrarFalha('9.9.9.9', 0);
    expect(l.bloqueado('9.9.9.9', JANELA_IP_MS - 1)).toBe(true);
    expect(l.bloqueado('9.9.9.9', JANELA_IP_MS)).toBe(false);
  });

  it('o escritório inteiro entra pelo mesmo IP: só as falhas contam', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 19; i++) l.registrarFalha('1.1.1.1', 0);
    for (let i = 0; i < 30; i++) expect(l.bloqueado('1.1.1.1', 0)).toBe(false);
  });

  it('a memória tem limite: saem os mais antigos, e o bloqueio dos recentes continua', () => {
    const l = criarLimiteLogin({ maximo: 1, maxChaves: 2 });
    for (const ip of ['a', 'b', 'c']) l.registrarFalha(ip, 0);
    expect(l.tamanho()).toBeLessThanOrEqual(2);
    expect(l.bloqueado('a', 0)).toBe(false); // o mais antigo saiu
    expect(l.bloqueado('c', 0)).toBe(true);
  });

  it('IPv6 conta por /64', () => {
    expect(chaveDoIp('2001:db8:1:2:aaaa::1')).toBe(chaveDoIp('2001:DB8:1:2:bbbb:cccc:dddd:2'));
    expect(chaveDoIp('2001:db8:1:3::1')).not.toBe(chaveDoIp('2001:db8:1:2::1'));
    expect(chaveDoIp('2001:db8::1')).toBe('2001:db8:0:0');
    expect(chaveDoIp('203.0.113.7')).toBe('203.0.113.7');
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) l.registrarFalha(`2001:db8:1:2::${i.toString(16)}`, 0);
    expect(l.bloqueado('2001:db8:1:2::ffff', 0)).toBe(true);
  });
});
