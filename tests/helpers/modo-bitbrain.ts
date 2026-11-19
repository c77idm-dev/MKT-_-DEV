import { vi } from 'vitest';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';

/** Liga o modo bitbrain com o Bitbrain falso no process.env (o configML() lê a cada chamada). Use vi.unstubAllEnvs() no afterEach. */
export function usarModoBitbrain(): void {
  vi.stubEnv('ML_CONECTOR', 'bitbrain');
  vi.stubEnv('BITBRAIN_URL', URL_BITBRAIN_FALSO);
  vi.stubEnv('BITBRAIN_TOKEN', TOKEN_BITBRAIN_FALSO);
  vi.stubEnv('PERMITIR_FALSOS', '1');
}
