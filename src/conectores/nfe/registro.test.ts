import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerEnv } from '@/lib/env';
import { ErroEmissorRecusou } from './erros';
import { EmissorFalso } from './falso';
import { definirEmissorParaTestes, obterEmissorNFe } from './registro';

// Os testes unitários não leem o .env: as variáveis vêm de vi.stubEnv. Se o lerEnv da Parte A exigir outra variável fora de
// produção, acrescente o vi.stubEnv dela aqui.
afterEach(() => {
  vi.unstubAllEnvs();
  definirEmissorParaTestes(null);
});

describe('obterEmissorNFe (contrato §5.7)', () => {
  it('usa o emissor definido pelo teste', () => {
    const emissor = new EmissorFalso();
    definirEmissorParaTestes(emissor);
    expect(obterEmissorNFe('PRODUCAO')).toBe(emissor);
  });

  it('EMISSOR_NFE=falso: o mesmo falso nos dois ambientes, sem token', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste');
    vi.stubEnv('EMISSOR_NFE', 'falso');
    const emissor = obterEmissorNFe('HOMOLOGACAO');
    expect(emissor).toBeInstanceOf(EmissorFalso);
    expect(obterEmissorNFe('PRODUCAO')).toBe(emissor);
  });

  it('EMISSOR_NFE=focus: exige o token do ambiente', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste');
    vi.stubEnv('EMISSOR_NFE', 'focus');
    vi.stubEnv('FOCUS_TOKEN_HOMOLOGACAO', 'token-h');
    vi.stubEnv('FOCUS_TOKEN_PRODUCAO', '');
    expect(obterEmissorNFe('HOMOLOGACAO')).not.toBeInstanceOf(EmissorFalso);
    expect(() => obterEmissorNFe('PRODUCAO')).toThrow(ErroEmissorRecusou);
    expect(() => obterEmissorNFe('PRODUCAO')).toThrow('Falta o token da Focus NFe de produção (FOCUS_TOKEN_PRODUCAO) no .env do servidor.');
  });

  it('em produção, o lerEnv recusa o emissor falso, a menos que PERMITIR_FALSOS=1 (só o e2e; D17, contrato §10, E1)', () => {
    const producao = { DATABASE_URL: 'postgres://teste', NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32), EMISSOR_NFE: 'falso' };
    expect(() => lerEnv(producao)).toThrow(/EMISSOR_NFE/);
    expect(lerEnv({ ...producao, PERMITIR_FALSOS: '1' }).EMISSOR_NFE).toBe('falso');
  });
});
