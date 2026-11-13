import { Upload } from 'tus-js-client';
import type { ResultadoRegistro } from '@/modules/midia/acoes';
import type { ResultadoTransporte, Transporte } from './filaEnvios';

export const ENDPOINT_TUS = '/api/midia';
/** Pedaços de 5 MB: cabem no limite do nginx (12 MB) e uma queda perde no máximo um pedaço. */
export const TAMANHO_PEDACO = 5 * 1024 * 1024;

const SEM_CONEXAO = 'Sem conexão com o servidor. Tentando de novo…';

export function idDoEnvio(url: string): string {
  return url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
}

/** Rede, 5xx, 423 (trava do tus) e 429: passageiros. O resto é definitivo e mostra a mensagem do servidor. */
export function resultadoDoErro(status: number | null, corpo: string): ResultadoTransporte {
  if (status === null || status === 0 || status >= 500 || status === 423 || status === 429) {
    return { ok: false, definitivo: false, mensagem: SEM_CONEXAO };
  }
  if (status === 401) {
    return { ok: false, definitivo: true, mensagem: 'Sua sessão terminou. Entre no sistema de novo e toque em "Tentar de novo".' };
  }
  const texto = corpo.trim();
  return { ok: false, definitivo: true, mensagem: texto && texto.length < 300 ? texto : `O servidor recusou o arquivo (erro ${status}).` };
}

/** Envia pelo tus (retoma pela uploadUrl guardada) e, no fim, pede o registro da evidência ao servidor. */
export function criarTransporteTus(registrar: (uploadId: string, idCliente: string) => Promise<ResultadoRegistro>): Transporte {
  return (r, eventos) =>
    new Promise<ResultadoTransporte>((resolver) => {
      const upload = new Upload(r.arquivo, {
        endpoint: ENDPOINT_TUS,
        uploadUrl: r.uploadUrl,
        chunkSize: TAMANHO_PEDACO,
        retryDelays: [0, 1000, 3000],
        // A uploadUrl fica no IndexedDB, junto do arquivo; o tus não precisa guardar nada no localStorage.
        storeFingerprintForResuming: false,
        metadata: {
          idCliente: r.idCliente,
          devolucaoId: r.devolucaoId,
          tipo: r.tipo,
          tipoConteudo: r.tipoConteudo,
          nome: r.nome,
          ...(r.itemId ? { itemId: r.itemId } : {}),
        },
        onUploadUrlAvailable() {
          if (upload.url) eventos.aoUrl(upload.url);
        },
        onProgress(enviados, total) {
          eventos.aoProgresso(total > 0 ? enviados / total : 0);
        },
        onShouldRetry(erro) {
          const status = erro.originalResponse?.getStatus() ?? 0;
          return status === 0 || status >= 500 || status === 423;
        },
        onError(erro) {
          const resposta = 'originalResponse' in erro ? erro.originalResponse : null;
          resolver(resultadoDoErro(resposta ? resposta.getStatus() : null, resposta ? resposta.getBody() : ''));
        },
        async onSuccess() {
          try {
            const reg = await registrar(idDoEnvio(upload.url ?? ''), r.idCliente);
            resolver(reg.ok ? { ok: true, evidenciaId: reg.evidenciaId } : { ok: false, definitivo: reg.definitivo, mensagem: reg.mensagem });
          } catch {
            resolver({ ok: false, definitivo: false, mensagem: SEM_CONEXAO });
          }
        },
      });
      upload.start();
    });
}
