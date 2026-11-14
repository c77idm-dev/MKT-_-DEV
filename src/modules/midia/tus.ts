import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { obterDb } from '@/db';
import type { Db } from '@/db/client';
import { pode } from '@/modules/auth/permissoes';
import { validarSessao } from '@/modules/auth/sessoes';
import { COOKIE_SESSAO, lerCookie } from './cookie';
import { LIMITE_VIDEO_BYTES } from './dominio';
import { autorizarEnvio, ErroEnvio, lerMetadados } from './recepcao';
import { pastaTus } from './temporarios';

type Recusa = { status_code: number; body: string };
const recusa = (status: number, mensagem: string): Recusa => ({ status_code: status, body: mensagem });

/**
 * Servidor tus (pesquisa §3.2). Recebe só os bytes; o registro da evidência é o passo seguinte (registrarEnvio).
 * - toda requisição exige sessão e o perfil que opera devoluções;
 * - continuar ou consultar um upload só pode quem o criou (o usuário fica gravado nos metadados);
 * - ao criar, as regras da recepção são conferidas antes de aceitar o primeiro byte.
 */
export function criarServidorTus(p: { diretorio: string; db: () => Db }): { servidor: Server; armazem: FileStore } {
  const armazem = new FileStore({ directory: p.diretorio });
  const usuarioDe = async (req: Request) => {
    const token = lerCookie(req.headers.get('cookie'), COOKIE_SESSAO);
    return token ? validarSessao(p.db(), token) : null;
  };
  const servidor = new Server({
    path: '/api/midia',
    datastore: armazem,
    relativeLocation: true,
    maxSize: LIMITE_VIDEO_BYTES,
    disableTerminationForFinishedUploads: true,
    async onIncomingRequest(req, uploadId) {
      if (req.method === 'OPTIONS') return;
      const usuario = await usuarioDe(req);
      if (!usuario) throw recusa(401, 'Sua sessão terminou. Entre no sistema de novo.');
      if (!pode(usuario.perfil, 'operar_devolucoes')) throw recusa(403, 'Seu perfil não envia evidências.');
      if (req.method !== 'POST' && uploadId) {
        const upload = await armazem.getUpload(uploadId).catch(() => null);
        if (upload && upload.metadata?.usuarioId !== usuario.id) throw recusa(403, 'Este envio é de outra pessoa.');
      }
    },
    async onUploadCreate(req, upload) {
      const usuario = await usuarioDe(req);
      if (!usuario) throw recusa(401, 'Sua sessão terminou. Entre no sistema de novo.');
      const meta = lerMetadados(upload.metadata);
      if (typeof meta === 'string') throw recusa(400, meta);
      try {
        await autorizarEnvio(p.db(), meta, upload.size, usuario);
      } catch (erro) {
        if (erro instanceof ErroEnvio) throw recusa(erro.status, erro.message);
        throw erro;
      }
      return { metadata: { ...upload.metadata, usuarioId: usuario.id } };
    },
  });
  return { servidor, armazem };
}

// No globalThis para o recarregamento do `next dev` não criar outro servidor (o tus trava uploads em memória).
const globalComTus = globalThis as unknown as { __tus?: ReturnType<typeof criarServidorTus> };

function instancia() {
  globalComTus.__tus ??= criarServidorTus({ diretorio: pastaTus(), db: obterDb });
  return globalComTus.__tus;
}

export function servidorTus(): Server {
  return instancia().servidor;
}

export function armazemTus(): FileStore {
  return instancia().armazem;
}
