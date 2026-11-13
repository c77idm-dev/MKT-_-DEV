import { z } from 'zod';

/** "CHAVE=" vazio no .env vale como ausente: assim o padrão é usado. */
function vazioComoAusente(valor: unknown): unknown {
  return typeof valor === 'string' && valor.trim() === '' ? undefined : valor;
}
const opcional = () => z.preprocess(vazioComoAusente, z.string().optional());
const comPadrao = (padrao: string) => z.preprocess(vazioComoAusente, z.string().default(padrao));
function lista<const T extends readonly [string, ...string[]]>(valores: T, padrao: T[number]) {
  return z.preprocess(vazioComoAusente, z.enum(valores).default(padrao));
}

/** Só para desenvolvimento e testes. Em produção, SEGREDO_LINKS é obrigatório. */
export const SEGREDO_LINKS_DESENVOLVIMENTO = 'segredo-de-desenvolvimento-nao-usar-em-producao';

/** Todas as variáveis das Fases 2 a 4 (contrato §3). Variável nova só por emenda ao contrato. */
const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Porta do servidor do e2e (só no PC de desenvolvimento). Não libera os falsos: isso é o PERMITIR_FALSOS. */
  PORTA_E2E: z.preprocess(vazioComoAusente, z.coerce.number().int().positive().optional()),
  /** "1" libera ML_CONECTOR/EMISSOR_NFE "falso" num build de produção. Só o e2e define (AMBIENTE_E2E); nunca no .env nem na VPS. */
  PERMITIR_FALSOS: lista(['0', '1'] as const, '0'),
  // Mídia (Fase 2)
  ARMAZENAMENTO: lista(['disco', 's3'] as const, 'disco'),
  MIDIA_DIR: comPadrao('.dados/midia'),
  MIDIA_TMP_DIR: comPadrao('.dados/tmp'),
  SEGREDO_LINKS: opcional(),
  S3_ENDPOINT: opcional(),
  S3_REGIAO: opcional(),
  S3_BUCKET: opcional(),
  S3_CHAVE_ID: opcional(),
  S3_CHAVE_SECRETA: opcional(),
  FFMPEG_PATH: comPadrao('ffmpeg'),
  FFPROBE_PATH: comPadrao('ffprobe'),
  // Mercado Livre (Fase 3)
  ML_CONECTOR: lista(['api', 'falso'] as const, 'api'),
  ML_CLIENT_ID: opcional(),
  ML_CLIENT_SECRET: opcional(),
  ML_REDIRECT_URI: opcional(),
  ML_USAR_PKCE: lista(['true', 'false'] as const, 'false'),
  CHAVE_CRIPTOGRAFIA: opcional(),
  // Focus NFe (Fase 4)
  EMISSOR_NFE: lista(['focus', 'falso'] as const, 'focus'),
  FOCUS_TOKEN_HOMOLOGACAO: opcional(),
  FOCUS_TOKEN_PRODUCAO: opcional(),
});

type EnvLido = z.infer<typeof esquema>;
export type Env = Omit<EnvLido, 'SEGREDO_LINKS'> & { SEGREDO_LINKS: string };

const VARIAVEIS_S3 = ['S3_ENDPOINT', 'S3_REGIAO', 'S3_BUCKET', 'S3_CHAVE_ID', 'S3_CHAVE_SECRETA'] as const;

function problemas(e: EnvLido): string[] {
  const erros: string[] = [];
  if (e.NODE_ENV === 'production') {
    // Contrato §10, E1: a liberação dos falsos é explícita (só o e2e define PERMITIR_FALSOS=1).
    if (e.PERMITIR_FALSOS !== '1') {
      if (e.ML_CONECTOR === 'falso') erros.push('ML_CONECTOR: "falso" não é aceito em produção');
      if (e.EMISSOR_NFE === 'falso') erros.push('EMISSOR_NFE: "falso" não é aceito em produção');
    }
    if (!e.SEGREDO_LINKS || e.SEGREDO_LINKS.length < 32) {
      erros.push('SEGREDO_LINKS: obrigatório em produção, com 32 caracteres ou mais (gere com: openssl rand -hex 32)');
    }
  }
  if (e.ARMAZENAMENTO === 's3') {
    for (const nome of VARIAVEIS_S3) if (!e[nome]) erros.push(`${nome}: obrigatório com ARMAZENAMENTO=s3`);
  }
  if (e.CHAVE_CRIPTOGRAFIA && Buffer.from(e.CHAVE_CRIPTOGRAFIA, 'base64').length !== 32) {
    erros.push('CHAVE_CRIPTOGRAFIA: precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32)');
  }
  return erros;
}

export function lerEnv(fonte: Record<string, string | undefined> = process.env): Env {
  const resultado = esquema.safeParse(fonte);
  if (!resultado.success) {
    const detalhes = resultado.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${detalhes}`);
  }
  const erros = problemas(resultado.data);
  if (erros.length > 0) throw new Error(`Variáveis de ambiente inválidas: ${erros.join('; ')}`);
  return { ...resultado.data, SEGREDO_LINKS: resultado.data.SEGREDO_LINKS ?? SEGREDO_LINKS_DESENVOLVIMENTO };
}
