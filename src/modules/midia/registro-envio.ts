import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { evidencias } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
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
  idCliente?: string,
): Promise<{ evidenciaId: string }> {
  if (!/^[0-9a-f]{32}$/.test(uploadId)) throw new ErroEnvio(400, 'Envio inválido.');
  const upload = await armazem.getUpload(uploadId).catch(() => null);
  if (!upload?.storage?.path) {
    // Retry depois do sucesso: o worker já processou a evidência e removeu o temporário. Com o idCliente, devolve a que existe.
    if (idCliente && ehUuid(idCliente)) {
      const [existente] = await db
        .select({ id: evidencias.id })
        .from(evidencias)
        .where(and(eq(evidencias.idCliente, idCliente), eq(evidencias.enviadoPor, usuario.id)));
      if (existente) return { evidenciaId: existente.id };
    }
    // Sem o idCliente não dá para saber se já foi registrado: não é definitivo, a fila tenta de novo.
    throw new ErroEnvio(404, 'O arquivo não chegou ao servidor. Envie de novo.', Boolean(idCliente));
  }
  if (upload.metadata?.usuarioId !== usuario.id) throw new ErroEnvio(403, 'Este envio é de outra pessoa.');
  // Ainda faltam bytes: não é definitivo, o celular continua o upload e pede de novo.
  if (upload.size === undefined || upload.offset !== upload.size) throw new ErroEnvio(409, 'O envio ainda não terminou.', false);
  const meta = lerMetadados(upload.metadata);
  if (typeof meta === 'string') throw new ErroEnvio(400, meta);
  const sha256 = await sha256DoArquivo(upload.storage.path);
  const r = await registrarRecebida(db, { meta, caminhoTemporario: upload.storage.path, tamanho: upload.size, sha256, usuario, agora });
  // Repetição do MESMO upload: o temporário é o da evidência existente e o worker ainda pode precisar dele.
  if (r.repetida) {
    const [existente] = await db.select({ temporario: evidencias.caminhoTemporario }).from(evidencias).where(eq(evidencias.id, r.evidenciaId));
    if (existente?.temporario !== upload.storage.path) await apagarTemporario(upload.storage.path);
  }
  return { evidenciaId: r.evidenciaId };
}
