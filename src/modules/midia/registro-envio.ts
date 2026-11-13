import type { Db } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { sha256DoArquivo } from './hash';
import { ErroEnvio, lerMetadados, registrarRecebida } from './recepcao';
import { apagarTemporario } from './temporarios';

type UploadTus = { size?: number; offset: number; metadata?: Record<string, string | null>; storage?: { path: string } };

/**
 * Depois que o tus termina, o celular pede o registro (decisão 3). Confere tudo de novo, calcula o SHA-256 do arquivo
 * no disco (spec §9) e grava a evidência. Repetir o pedido é seguro (idempotente pelo id_cliente).
 */
export async function registrarEnvio(
  db: Db,
  armazem: { getUpload(id: string): Promise<UploadTus> },
  uploadId: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ evidenciaId: string }> {
  if (!/^[0-9a-f]{32}$/.test(uploadId)) throw new ErroEnvio(400, 'Envio inválido.');
  const upload = await armazem.getUpload(uploadId).catch(() => null);
  if (!upload?.storage?.path) throw new ErroEnvio(404, 'O arquivo não chegou ao servidor. Envie de novo.');
  if (upload.metadata?.usuarioId !== usuario.id) throw new ErroEnvio(403, 'Este envio é de outra pessoa.');
  // Ainda faltam bytes: não é definitivo, o celular continua o upload e pede de novo.
  if (upload.size === undefined || upload.offset !== upload.size) throw new ErroEnvio(409, 'O envio ainda não terminou.', false);
  const meta = lerMetadados(upload.metadata);
  if (typeof meta === 'string') throw new ErroEnvio(400, meta);
  const sha256 = await sha256DoArquivo(upload.storage.path);
  const r = await registrarRecebida(db, { meta, caminhoTemporario: upload.storage.path, tamanho: upload.size, sha256, usuario, agora });
  if (r.repetida) await apagarTemporario(upload.storage.path);
  return { evidenciaId: r.evidenciaId };
}
