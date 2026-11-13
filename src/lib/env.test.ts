import { describe, expect, it } from 'vitest';
import { lerEnv, SEGREDO_LINKS_DESENVOLVIMENTO } from './env';

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
