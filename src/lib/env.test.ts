import { describe, expect, it } from 'vitest';
import { lerEnv, SEGREDO_LINKS_DESENVOLVIMENTO, TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from './env';

const BASE = { DATABASE_URL: 'postgres://u:s@h:5432/b' };

describe('lerEnv', () => {
  it('exige DATABASE_URL', () => {
    expect(() => lerEnv({})).toThrow(/DATABASE_URL/);
  });

  it('usa os padrões de desenvolvimento', () => {
    expect(lerEnv(BASE)).toMatchObject({
      DATABASE_URL: 'postgres://u:s@h:5432/b',
      NODE_ENV: 'development',
      ARMAZENAMENTO: 'disco',
      MIDIA_DIR: '.dados/midia',
      MIDIA_TMP_DIR: '.dados/tmp',
      SEGREDO_LINKS: SEGREDO_LINKS_DESENVOLVIMENTO,
      FFMPEG_PATH: 'ffmpeg',
      FFPROBE_PATH: 'ffprobe',
      ML_CONECTOR: 'api',
      ML_USAR_PKCE: 'false',
      EMISSOR_NFE: 'focus',
      PERMITIR_FALSOS: '0',
    });
  });

  it('"CHAVE=" vazio no .env vale como ausente', () => {
    const env = lerEnv({ ...BASE, MIDIA_DIR: '', ARMAZENAMENTO: '', ML_CLIENT_ID: '', PORTA_E2E: '' });
    expect(env.MIDIA_DIR).toBe('.dados/midia');
    expect(env.ARMAZENAMENTO).toBe('disco');
    expect(env.ML_CLIENT_ID).toBeUndefined();
    expect(env.PORTA_E2E).toBeUndefined();
  });

  it('em produção recusa os falsos e exige SEGREDO_LINKS com 32 caracteres', () => {
    expect(() => lerEnv({ ...BASE, NODE_ENV: 'production', ML_CONECTOR: 'falso', EMISSOR_NFE: 'falso' })).toThrow(
      /ML_CONECTOR.*EMISSOR_NFE.*SEGREDO_LINKS/,
    );
    const env = lerEnv({ ...BASE, NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) });
    expect(env.ML_CONECTOR).toBe('api');
    expect(env.SEGREDO_LINKS).toBe('x'.repeat(32));
  });

  it('só PERMITIR_FALSOS=1 libera os falsos num build de produção (o e2e); PORTA_E2E não libera nada', () => {
    const E2E = { ...BASE, NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32), ML_CONECTOR: 'falso', EMISSOR_NFE: 'falso' };
    const env = lerEnv({ ...E2E, PERMITIR_FALSOS: '1' });
    expect(env.ML_CONECTOR).toBe('falso');
    expect(env.EMISSOR_NFE).toBe('falso');
    expect(() => lerEnv({ ...E2E, PORTA_E2E: '3100' })).toThrow(/ML_CONECTOR.*EMISSOR_NFE/);
    expect(() => lerEnv({ ...E2E, PERMITIR_FALSOS: '0' })).toThrow(/ML_CONECTOR/);
    // PERMITIR_FALSOS não afrouxa o SEGREDO_LINKS.
    expect(() => lerEnv({ ...BASE, NODE_ENV: 'production', PERMITIR_FALSOS: '1' })).toThrow(/SEGREDO_LINKS/);
  });

  it('ARMAZENAMENTO=s3 exige as cinco variáveis do S3', () => {
    expect(() => lerEnv({ ...BASE, ARMAZENAMENTO: 's3', S3_BUCKET: 'midias' })).toThrow(/S3_ENDPOINT.*S3_REGIAO.*S3_CHAVE_ID.*S3_CHAVE_SECRETA/);
  });

  it('CHAVE_CRIPTOGRAFIA precisa ter 32 bytes em base64', () => {
    expect(() => lerEnv({ ...BASE, CHAVE_CRIPTOGRAFIA: Buffer.alloc(16, 1).toString('base64') })).toThrow(/CHAVE_CRIPTOGRAFIA/);
    expect(lerEnv({ ...BASE, CHAVE_CRIPTOGRAFIA: Buffer.alloc(32, 1).toString('base64') }).CHAVE_CRIPTOGRAFIA).toBeDefined();
  });

  it('recusa valor fora da lista', () => {
    expect(() => lerEnv({ ...BASE, ARMAZENAMENTO: 'ftp' })).toThrow(/ARMAZENAMENTO/);
    expect(() => lerEnv({ ...BASE, PERMITIR_FALSOS: 'sim' })).toThrow(/PERMITIR_FALSOS/);
  });
});

describe('lerEnv: ML_CONECTOR=bitbrain (integração de 18/11)', () => {
  const BB = { ...BASE, ML_CONECTOR: 'bitbrain', BITBRAIN_URL: 'https://bitbrain.exemplo.com.br', BITBRAIN_TOKEN: 'a'.repeat(64) };

  it('aceita a URL e o token; o padrão continua api', () => {
    expect(lerEnv(BASE).ML_CONECTOR).toBe('api');
    expect(lerEnv(BB)).toMatchObject({ ML_CONECTOR: 'bitbrain', BITBRAIN_URL: 'https://bitbrain.exemplo.com.br' });
  });

  it('exige BITBRAIN_URL e BITBRAIN_TOKEN', () => {
    expect(() => lerEnv({ ...BASE, ML_CONECTOR: 'bitbrain' })).toThrow(/BITBRAIN_URL.*BITBRAIN_TOKEN/);
  });

  it('em produção a URL precisa ser https; fora dela, http serve; texto que não é URL é recusado', () => {
    const PROD = { ...BB, NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) };
    expect(() => lerEnv({ ...PROD, BITBRAIN_URL: 'http://bitbrain.exemplo.com.br' })).toThrow(/BITBRAIN_URL: em produção precisa começar com https/);
    expect(lerEnv(PROD).BITBRAIN_URL).toBe('https://bitbrain.exemplo.com.br');
    expect(lerEnv({ ...BB, BITBRAIN_URL: 'http://localhost:8000' }).BITBRAIN_URL).toBe('http://localhost:8000');
    expect(() => lerEnv({ ...BB, BITBRAIN_URL: 'bitbrain' })).toThrow(/BITBRAIN_URL: precisa ser um endereço http/);
  });

  it('o Bitbrain falso só vale com PERMITIR_FALSOS=1 (E1), em qualquer NODE_ENV', () => {
    const FALSO = { ...BB, BITBRAIN_URL: URL_BITBRAIN_FALSO, BITBRAIN_TOKEN: TOKEN_BITBRAIN_FALSO };
    expect(() => lerEnv(FALSO)).toThrow(/BITBRAIN_URL: o Bitbrain falso só vale com PERMITIR_FALSOS=1/);
    expect(lerEnv({ ...FALSO, PERMITIR_FALSOS: '1' }).BITBRAIN_URL).toBe(URL_BITBRAIN_FALSO);
    expect(lerEnv({ ...FALSO, PERMITIR_FALSOS: '1', NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) }).ML_CONECTOR).toBe('bitbrain');
  });

  it('a mensagem de erro nunca traz o token', () => {
    let mensagem = '';
    try {
      lerEnv({ ...BB, BITBRAIN_URL: 'ftp://x', BITBRAIN_TOKEN: 'segredo-que-nao-pode-vazar' });
    } catch (erro) {
      mensagem = String(erro);
    }
    expect(mensagem).toContain('BITBRAIN_URL');
    expect(mensagem).not.toContain('segredo-que-nao-pode-vazar');
  });
});
