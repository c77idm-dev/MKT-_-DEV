import { lerEnv } from '@/lib/env';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorRecusou } from './erros';
import { EmissorFalso } from './falso';
import { criarEmissorFocus } from './focus';
import type { EmissorNFe } from './tipos';

let paraTestes: EmissorNFe | null = null;
// O falso guarda as notas na memória: uma instância por processo (o `next dev` recarrega módulos; o globalThis fica).
const armazem = globalThis as unknown as { __emissorNfeFalso?: EmissorFalso };

/** Contrato §5.7: o emissor do ambiente (token de homologação ou de produção), conforme EMISSOR_NFE. */
export function obterEmissorNFe(ambiente: AmbienteNfe): EmissorNFe {
  if (paraTestes) return paraTestes;
  const env = lerEnv();
  if (env.EMISSOR_NFE === 'falso') {
    armazem.__emissorNfeFalso ??= new EmissorFalso();
    return armazem.__emissorNfeFalso;
  }
  const producao = ambiente === 'PRODUCAO';
  const token = producao ? env.FOCUS_TOKEN_PRODUCAO : env.FOCUS_TOKEN_HOMOLOGACAO;
  if (!token) {
    throw new ErroEmissorRecusou(
      `Falta o token da Focus NFe de ${producao ? 'produção (FOCUS_TOKEN_PRODUCAO)' : 'homologação (FOCUS_TOKEN_HOMOLOGACAO)'} no .env do servidor.`,
    );
  }
  return criarEmissorFocus({ ambiente, token });
}

export function definirEmissorParaTestes(emissor: EmissorNFe | null): void {
  paraTestes = emissor;
}
