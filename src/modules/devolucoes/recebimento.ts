import { and, desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import type { StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';

/** Pacote que chegou numa devolução nesses status precisa de decisão do Gestor. */
const BLOQUEADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'NO_CD_MARKETPLACE'];

export type ResultadoRecebimento =
  | { tipo: 'recebidas'; codigos: string[]; em: Date }
  | { tipo: 'ja_recebida'; codigo: string; status: StatusDevolucao; recebidaEm: Date | null }
  | { tipo: 'bloqueada'; codigo: string; status: StatusDevolucao }
  | { tipo: 'nao_encontrada'; rastreio: string };

function rastreioOuErro(bruto: string): string {
  const rastreio = normalizarRastreio(bruto);
  if (!rastreio) throw new ErroDevolucao('Leia ou digite o código de rastreamento.');
  if (rastreio.length > 60) throw new ErroDevolucao('Código de rastreamento longo demais.');
  return rastreio;
}

async function maisRecentePorRastreio(db: DbOuTx, rastreio: string) {
  const [linha] = await db
    .select({ codigo: devolucoes.codigo, status: devolucoes.status, recebidaEm: devolucoes.recebidaEm })
    .from(devolucoes)
    .where(eq(devolucoes.rastreio, rastreio))
    .orderBy(desc(devolucoes.numero))
    .limit(1);
  return linha ?? null;
}

/**
 * Recepção física (spec §6.2): o rastreio lido move a devolução de "Pendente de chegada" para
 * "Aguardando conferência" e registra data, hora e usuário. É a única coisa que move a etapa 1 (spec §5.2).
 *
 * Duas leituras simultâneas (dois celulares): a mudança é um UPDATE condicional ao status, então só uma
 * leitura registra a chegada e grava o evento; a outra recebe `ja_recebida`.
 */
export async function receberPorRastreio(
  db: DbOuTx,
  rastreioBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoRecebimento> {
  exigirTransicao(
    { de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil },
    'Seu perfil não pode registrar o recebimento de pacotes.',
  );
  const rastreio = rastreioOuErro(rastreioBruto);
  const pendentes = await db
    .select({ id: devolucoes.id })
    .from(devolucoes)
    .where(and(eq(devolucoes.rastreio, rastreio), eq(devolucoes.status, 'PENDENTE_CHEGADA')));

  if (pendentes.length > 0) {
    const codigos = await db.transaction(async (tx) => {
      const recebidas: string[] = [];
      for (const pendente of pendentes) {
        const [atualizada] = await tx
          .update(devolucoes)
          .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: usuario.id, atualizadaEm: agora })
          .where(and(eq(devolucoes.id, pendente.id), eq(devolucoes.status, 'PENDENTE_CHEGADA')))
          .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
        if (!atualizada) continue; // outro operador registrou a chegada no mesmo instante
        await registrarEvento(tx, {
          entidade: 'devolucao',
          entidadeId: atualizada.id,
          acao: 'recebida',
          de: 'PENDENTE_CHEGADA',
          para: 'AGUARDANDO_CONFERENCIA',
          usuarioId: usuario.id,
          dados: { rastreio },
          em: agora,
        });
        recebidas.push(atualizada.codigo);
      }
      return recebidas;
    });
    if (codigos.length > 0) return { tipo: 'recebidas', codigos: codigos.sort(), em: agora };
  }

  const atual = await maisRecentePorRastreio(db, rastreio);
  if (!atual) return { tipo: 'nao_encontrada', rastreio };
  if (BLOQUEADAS.includes(atual.status)) return { tipo: 'bloqueada', codigo: atual.codigo, status: atual.status };
  return { tipo: 'ja_recebida', codigo: atual.codigo, status: atual.status, recebidaEm: atual.recebidaEm };
}

/** Rastreio sem cadastro (spec §6.2): nasce em "Aguardando conferência", marcada como não identificada, sem canal. */
export async function criarNaoIdentificada(
  db: DbOuTx,
  rastreioBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ id: string; codigo: string }> {
  exigirTransicao(
    { de: null, para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil, naoIdentificada: true },
    'Seu perfil não pode registrar um pacote não identificado.',
  );
  const rastreio = rastreioOuErro(rastreioBruto);
  const existente = await maisRecentePorRastreio(db, rastreio);
  if (existente) throw new ErroDevolucao(`Já existe a devolução ${existente.codigo} com este rastreio. Registre a chegada por ela.`);
  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        origem: 'MANUAL',
        rastreio,
        status: 'AGUARDANDO_CONFERENCIA',
        naoIdentificada: true,
        criadoPor: usuario.id,
        criadaEm: agora,
        recebidaEm: agora,
        recebidaPor: usuario.id,
        atualizadaEm: agora,
      })
      .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: criada.id,
      acao: 'criada_nao_identificada',
      de: null,
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      dados: { rastreio },
      em: agora,
    });
    return criada;
  });
}
