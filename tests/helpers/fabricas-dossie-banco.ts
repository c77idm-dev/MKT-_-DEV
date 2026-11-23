import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { asc, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { Db } from '@/db/client';
import { contasBitbrain, evidencias, itensDevolucao, motivosReclamacaoMl, reclamacoesMl } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { registrarEan, salvarItem } from '@/modules/conferencia/itens';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { chaveEvidencia } from '@/modules/midia/chaves';
import type { TipoEvidencia } from '@/modules/midia/dominio';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from './fabricas';

export const EAN_DOSSIE = '7891000000014';
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** JPEG de verdade (uma cor por evidência), como o worker deixaria no armazenamento. */
export async function jpegTeste(cor: { r: number; g: number; b: number }, largura = 1600, altura = 1200): Promise<Buffer> {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: cor } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Evidência PRONTA com o arquivo no armazenamento (o de memória nos testes de integração). */
export async function evidenciaComArquivo(
  db: Db,
  p: { devolucaoId: string; tipo: TipoEvidencia; itemId?: string | null; conteudo: Buffer; usuarioId: string | null; enviadoEm?: Date },
): Promise<{ id: string; caminho: string; sha256Final: string }> {
  const id = randomUUID();
  const video = p.tipo === 'VIDEO_PROVA';
  const caminho = chaveEvidencia(p.devolucaoId, id, video ? 'mp4' : 'jpg');
  const tipoConteudo = video ? 'video/mp4' : 'image/jpeg';
  await obterArmazenamento().salvar(caminho, Readable.from([p.conteudo]), { tipoConteudo, tamanho: p.conteudo.length });
  const sha256Final = sha256(p.conteudo);
  await db.insert(evidencias).values({
    id,
    devolucaoId: p.devolucaoId,
    itemId: p.itemId ?? null,
    tipo: p.tipo,
    tipoConteudo,
    caminho,
    provedor: 'disco',
    tamanhoOriginal: p.conteudo.length + 100,
    tamanho: p.conteudo.length,
    sha256Original: sha256(Buffer.concat([Buffer.from('original-'), p.conteudo])),
    sha256Final,
    situacaoProcessamento: 'PRONTA',
    idCliente: randomUUID(),
    enviadoPor: p.usuarioId,
    ...(p.enviadoEm ? { enviadoEm: p.enviadoEm } : {}),
    processadoEm: new Date(),
  });
  return { id, caminho, sha256Final };
}

let contador = 0;

export type ProvasTeste = {
  id: string;
  codigo: string;
  pedido: string;
  reclamacaoId: string;
  rastreio: string;
  sku: string;
  operador: UsuarioSessao;
  itens: string[];
  evidencias: Record<'f1' | 'f2' | 'f3' | 'f4' | 'avaria' | 'video', { id: string; caminho: string; sha256Final: string }>;
};

/**
 * Devolução do ML pelo caminho de verdade (chegada, conferência, EAN, unidades, evidências e conclusão), para o dossiê:
 * unidade 1 com Estoque Problema (Avariado) e o EAN que confere; unidade 2 ausente. Grava também a reclamação do ML
 * (motivo no cache e conta do Bitbrain) e a razão social. `concluir: false` deixa a devolução em conferência.
 * `video`: os bytes do Vídeo de Prova (o padrão não é um vídeo de verdade: o quadro vira aviso). `eanLido`: o código que
 * o operador lê na unidade 1 (padrão: o do produto esperado); o EAN de outro produto do cadastro a deixa divergente.
 */
export async function devolucaoComProvasTeste(db: Db, p: { concluir?: boolean; video?: Buffer; eanLido?: string } = {}): Promise<ProvasTeste> {
  contador += 1;
  const marca = `${Date.now().toString(36).toUpperCase()}${contador}`;
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  const sku = `FONE-DOSSIE-${marca}`;
  await criarProdutoTeste(db, { sku, ean: EAN_DOSSIE, descricao: 'Fone Bluetooth Ação' });
  const rastreio = `DOS${marca}`;
  const pedido = `2000${Date.now()}${contador}`;
  const reclamacaoId = `53${Date.now()}${contador}`;
  const criada = await criarDevolucaoTeste(db, operador, {
    canal: 'MERCADO_LIVRE',
    pedido,
    reclamacaoId,
    rastreio,
    motivoCliente: 'Produto não funciona',
    itens: [{ sku, quantidade: 2 }],
  });
  await receberPorRastreio(db, rastreio, operador);
  await iniciarConferencia(db, criada.id, operador);
  const itens = (
    await db.select({ id: itensDevolucao.id }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, criada.id)).orderBy(asc(itensDevolucao.unidade))
  ).map((i) => i.id);
  await registrarEan(db, criada.id, itens[0], p.eanLido ?? EAN_DOSSIE, operador);
  await salvarItem(
    db,
    criada.id,
    itens[0],
    { serial: 'SN-ABC-1', loteFabricacao: 'L2026', validade: '12/2027', decisao: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Caixa amassada e tela trincada.' },
    operador,
  );
  await salvarItem(db, criada.id, itens[1], { serial: '', loteFabricacao: '', validade: '', decisao: 'AUSENTE', motivo: null, observacao: '' }, operador);

  const comArquivo = async (tipo: TipoEvidencia, itemId: string | null, conteudo: Buffer) =>
    evidenciaComArquivo(db, { devolucaoId: criada.id, tipo, itemId, conteudo, usuarioId: operador.id });
  const ev = {
    f1: await comArquivo('FOTO_1_ETIQUETA', null, await jpegTeste({ r: 200, g: 180, b: 40 })),
    f2: await comArquivo('FOTO_2_EMBALAGEM', null, await jpegTeste({ r: 150, g: 110, b: 60 })),
    f3: await comArquivo('FOTO_3_PRODUTO', itens[0], await jpegTeste({ r: 40, g: 90, b: 160 }, 1200, 1600)),
    f4: await comArquivo('FOTO_4_CODIGO_SERIAL', itens[0], await jpegTeste({ r: 60, g: 140, b: 90 })),
    avaria: await comArquivo('EXTRA', itens[0], await jpegTeste({ r: 170, g: 50, b: 50 })),
    video: await comArquivo('VIDEO_PROVA', null, p.video ?? Buffer.from('não é um vídeo de verdade')),
  };
  if (p.concluir !== false) await concluirConferencia(db, criada.id, operador);

  await db
    .insert(contasBitbrain)
    .values({ empresa: 'loja-dossie', nome: 'Loja Dossiê', sellerId: '123456' })
    .onConflictDoNothing();
  await db
    .insert(motivosReclamacaoMl)
    .values({ id: 'PDD9949', nome: 'Chegou com defeito', consultadoEm: new Date() })
    .onConflictDoNothing();
  await db.insert(reclamacoesMl).values({ claimId: reclamacaoId, devolucaoId: criada.id, motivoId: 'PDD9949', conta: 'loja-dossie', sincronizadaEm: new Date() });
  await db.execute(sql`insert into configuracoes (id, razao_social) values (1, 'Loja Exemplo Ltda') on conflict (id) do update set razao_social = excluded.razao_social`);
  return { id: criada.id, codigo: criada.codigo, pedido, reclamacaoId, rastreio, sku, operador, itens, evidencias: ev };
}
