import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidencias } from '@/db/schema';
import { criarSessao } from '@/modules/auth/sessoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { sha256DoBuffer } from './hash';
import { registrarEnvio } from './registro-envio';
import { criarServidorTus } from './tus';

const { db, sql } = criarDbTeste();
let pasta: string;
let tus: ReturnType<typeof criarServidorTus>;
let operador: UsuarioSessao;
let cookie: string;

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'tus-'));
  tus = criarServidorTus({ diretorio: pasta, db: () => db });
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  cookie = `sessao=${(await criarSessao(db, operador.id)).token}`;
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

function metadados(campos: Record<string, string>): string {
  return Object.entries(campos)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',');
}

/** Cria o upload e manda o arquivo inteiro num PATCH; devolve o id do upload. */
async function enviar(conteudo: Buffer, campos: Record<string, string>, comCookie = cookie): Promise<{ status: number; id: string | null }> {
  const criar = await tus.servidor.handleWeb(
    new Request('http://localhost/api/midia', {
      method: 'POST',
      headers: { 'tus-resumable': '1.0.0', 'upload-length': String(conteudo.length), 'upload-metadata': metadados(campos), cookie: comCookie },
    }),
  );
  if (criar.status !== 201) return { status: criar.status, id: null };
  const local = criar.headers.get('location')!;
  const patch = await tus.servidor.handleWeb(
    new Request(`http://localhost${local}`, {
      method: 'PATCH',
      headers: { 'tus-resumable': '1.0.0', 'upload-offset': '0', 'content-type': 'application/offset+octet-stream', cookie: comCookie },
      body: new Uint8Array(conteudo),
    }),
  );
  return { status: patch.status, id: local.split('/').pop()! };
}

describe('upload pelo tus (route handler /api/midia)', () => {
  it('recebe a foto, guarda o usuário no envio e o registro grava a evidência com o SHA-256', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const conteudo = Buffer.from('jpeg-de-mentira');
    const idCliente = randomUUID();
    const r = await enviar(conteudo, { idCliente, devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg', nome: 'foto-1.jpg' });
    expect(r.status).toBe(204);
    expect((await tus.armazem.getUpload(r.id!)).metadata?.usuarioId).toBe(operador.id);

    const { evidenciaId } = await registrarEnvio(db, tus.armazem, r.id!, operador);
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, evidenciaId));
    expect(e).toMatchObject({ idCliente, sha256Original: sha256DoBuffer(conteudo), tamanhoOriginal: conteudo.length, caminhoTemporario: join(pasta, r.id!) });
  });

  it('o mesmo envio mandado duas vezes vira uma evidência só, e o arquivo repetido é apagado', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const campos = { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM', tipoConteudo: 'image/jpeg' };
    const a = await enviar(Buffer.from('a'), campos);
    const b = await enviar(Buffer.from('a'), campos);
    const primeira = await registrarEnvio(db, tus.armazem, a.id!, operador);
    expect(await registrarEnvio(db, tus.armazem, b.id!, operador)).toEqual(primeira);
    expect(existsSync(join(pasta, b.id!))).toBe(false);
  });

  it('repetir o registro do MESMO upload devolve a mesma evidência e mantém o arquivo no disco', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const r = await enviar(Buffer.from('original'), { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' });
    const primeira = await registrarEnvio(db, tus.armazem, r.id!, operador);
    expect(await registrarEnvio(db, tus.armazem, r.id!, operador)).toEqual(primeira);
    expect(existsSync(join(pasta, r.id!))).toBe(true);
  });

  it('retry depois que o worker já removeu o temporário: com o idCliente devolve a evidência existente, sem 404', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const idCliente = randomUUID();
    const r = await enviar(Buffer.from('original'), { idCliente, devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' });
    const primeira = await registrarEnvio(db, tus.armazem, r.id!, operador);
    await rm(join(pasta, r.id!), { force: true });
    await rm(join(pasta, `${r.id!}.json`), { force: true });
    expect(await registrarEnvio(db, tus.armazem, r.id!, operador, new Date(), idCliente)).toEqual(primeira);
    // Sem o idCliente, ou com o de outra pessoa, continua não achando.
    await expect(registrarEnvio(db, tus.armazem, r.id!, operador)).rejects.toMatchObject({ status: 404, definitivo: false });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(registrarEnvio(db, tus.armazem, r.id!, outro, new Date(), idCliente)).rejects.toMatchObject({ status: 404 });
  });

  it('sem sessão: 401; perfil sem permissão: 403; conferência de outra pessoa: 409', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const campos = { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' };
    expect((await enviar(Buffer.from('x'), campos, '')).status).toBe(401);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    expect((await enviar(Buffer.from('x'), campos, `sessao=${(await criarSessao(db, fiscal.id)).token}`)).status).toBe(403);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    expect((await enviar(Buffer.from('x'), campos, `sessao=${(await criarSessao(db, outro.id)).token}`)).status).toBe(409);
  });

  it('outra pessoa não continua nem registra o envio de alguém', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const r = await enviar(Buffer.from('x'), { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const cabeca = await tus.servidor.handleWeb(
      new Request(`http://localhost/api/midia/${r.id}`, {
        method: 'HEAD',
        headers: { 'tus-resumable': '1.0.0', cookie: `sessao=${(await criarSessao(db, outro.id)).token}` },
      }),
    );
    expect(cabeca.status).toBe(403);
    await expect(registrarEnvio(db, tus.armazem, r.id!, outro)).rejects.toMatchObject({ status: 403 });
  });
});
