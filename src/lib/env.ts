import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ML_CLIENT_ID: z.string().optional(),
});

export type Env = z.infer<typeof esquema>;

export function lerEnv(fonte: Record<string, string | undefined> = process.env): Env {
  const resultado = esquema.safeParse(fonte);
  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${detalhes}`);
  }
  return resultado.data;
}
