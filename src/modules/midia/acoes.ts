'use server';

import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroEnvio } from './recepcao';
import { registrarEnvio } from './registro-envio';
import { armazemTus } from './tus';

export type ResultadoRegistro = { ok: true; evidenciaId: string } | { ok: false; mensagem: string; definitivo: boolean };

/** Chamada pela fila do celular quando o tus termina. Só o pedido pequeno passa por Server Action, nunca o arquivo. */
export async function registrarEnvioAcao(uploadId: string): Promise<ResultadoRegistro> {
  const usuario = await exigirPermissao('operar_devolucoes');
  try {
    const r = await registrarEnvio(obterDb(), armazemTus(), String(uploadId), usuario);
    return { ok: true, evidenciaId: r.evidenciaId };
  } catch (erro) {
    if (erro instanceof ErroEnvio) return { ok: false, mensagem: erro.message, definitivo: erro.definitivo };
    throw erro;
  }
}
