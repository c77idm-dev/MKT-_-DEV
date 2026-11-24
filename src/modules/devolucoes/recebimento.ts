import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import type { StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';
import { padraoRastreioDoEnvioML, pedidosDoCodigo } from './etiqueta-ml';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';

/**
 * A leitura na recepção registra a chegada nesses status: o pendente e, desde a emenda E25 (extra), o pacote que o ML
 * mandou de volta do armazém dele ("No CD do marketplace").
 */
const A_RECEBER: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'];
/** Pacote que chegou numa devolução nesses status precisa de decisão do Gestor. */
const BLOQUEADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA'];
const MENSAGEM_PERFIL = 'Seu perfil não pode registrar o recebimento de pacotes.';

/**
 * (extra, E25) Por qual outro número da etiqueta do ML o código lido achou a devolução. Sem ele (campo ausente), foi pelo
 * rastreio, como sempre.
 */
export type AchadaPor = 'PEDIDO_ML' | 'ENVIO_ML';

export type ResultadoRecebimento =
  /** `doArmazemML` (extra, E25): os códigos que estavam "No CD do marketplace"; só aparece quando há algum. */
  | { tipo: 'recebidas'; codigos: string[]; em: Date; achadaPor?: AchadaPor; doArmazemML?: string[] }
  | { tipo: 'ja_recebida'; codigo: string; status: StatusDevolucao; recebidaEm: Date | null; achadaPor?: AchadaPor }
  | { tipo: 'bloqueada'; codigo: string; status: StatusDevolucao; achadaPor?: AchadaPor }
  /**
   * (extra, E27) Achadas pelo número do pedido do ML: nada é registrado. `ids` são as devoluções do pedido que esperam o
   * pacote (Pendente de chegada ou No CD), na ordem do número; a tela mostra a ficha (ou a lista) e a pessoa toca na que
   * chegou ("Dar chegada", `darChegadaPeloPedido`).
   */
  | { tipo: 'escolher'; codigoLido: string; ids: string[]; achadaPor: 'PEDIDO_ML' }
  | { tipo: 'nao_encontrada'; rastreio: string };

/** Uma devolução achada por uma regra, em qualquer status. */
export type DevolucaoAchada = { id: string; codigo: string; status: StatusDevolucao };
type Candidata = DevolucaoAchada;

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

/** A mais recente (pelo número) entre as achadas, relida agora: outra leitura pode ter acabado de registrar a chegada. */
async function maisRecenteEntre(db: DbOuTx, ids: string[]) {
  const [linha] = await db
    .select({ codigo: devolucoes.codigo, status: devolucoes.status, recebidaEm: devolucoes.recebidaEm })
    .from(devolucoes)
    .where(inArray(devolucoes.id, ids))
    .orderBy(desc(devolucoes.numero))
    .limit(1);
  return linha ?? null;
}

/** As devoluções de uma regra, em qualquer status, na ordem fixa do número. */
function candidatas(db: DbOuTx, condicao: SQL): Promise<Candidata[]> {
  // Ordem fixa: duas transações travam as linhas na mesma ordem, sem deadlock.
  return db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status })
    .from(devolucoes)
    .where(condicao)
    .orderBy(asc(devolucoes.numero));
}

/** As regras 2 e 3 olham só as devoluções do Mercado Livre: no resto do sistema o pedido só é único por (canal, pedido). */
function doML(condicao: SQL): SQL {
  return and(eq(devolucoes.canal, 'MERCADO_LIVRE'), condicao)!;
}

/**
 * Onde o código lido aparece. A primeira regra que achar alguma devolução, em qualquer status, decide:
 * 1. o rastreio exato (como sempre), em qualquer canal;
 * 2. (extra, E25) só para código feito só de dígitos: o número do pedido do ML, inteiro, em `pedidos_externos` das
 *    devoluções do ML;
 * 3. (extra, E25) idem: o número do envio do ML dentro do rastreio do Mercado Envios das devoluções do ML.
 */
/**
 * Regra 2 da E25: as devoluções do ML com este número de pedido, em qualquer status, na ordem do número. Vale o elemento
 * de `pedidos_externos` igual ao código ou, com 15 dígitos, igual a "2" + código; só código feito só de dígitos (senão,
 * nenhuma). (extra, E27) O Conferir pacote e a Retirada do Full usam a mesma busca.
 */
export function devolucoesDoPedidoML(db: DbOuTx, codigo: string): Promise<DevolucaoAchada[]> {
  const pedidos = pedidosDoCodigo(codigo);
  if (pedidos.length === 0) return Promise.resolve([]);
  // `&&` usa o índice GIN devolucoes_pedidos_externos_gin (junto com o filtro do canal); cada pedido guardado é
  // comparado inteiro.
  return candidatas(
    db,
    doML(
      sql`${devolucoes.pedidosExternos} && ARRAY[${sql.join(
        pedidos.map((p) => sql`${p}`),
        sql`, `,
      )}]::text[]`,
    ),
  );
}

async function procurar(db: DbOuTx, codigo: string): Promise<{ achadas: Candidata[]; achadaPor?: AchadaPor }> {
  const porRastreio = await candidatas(db, eq(devolucoes.rastreio, codigo));
  if (porRastreio.length > 0) return { achadas: porRastreio };
  const porPedido = await devolucoesDoPedidoML(db, codigo);
  if (porPedido.length > 0) return { achadas: porPedido, achadaPor: 'PEDIDO_ML' };
  const padrao = padraoRastreioDoEnvioML(codigo);
  if (padrao) {
    // A expressão vai como parâmetro (o código já é só de dígitos). Sem índice: percorre a tabela, o que só acontece
    // quando o rastreio e o pedido não acharam nada.
    const porEnvio = await candidatas(db, doML(sql`${devolucoes.rastreio} ~ ${padrao}`));
    if (porEnvio.length > 0) return { achadas: porEnvio, achadaPor: 'ENVIO_ML' };
  }
  return { achadas: [] };
}

/**
 * (extra, E27) O que fazer com as devoluções achadas pelo número do pedido: as que esperam o pacote vão para a escolha
 * da pessoa (nada é registrado sozinho); sem nenhuma esperando, a mais recente diz se o pacote já chegou ou se está
 * bloqueada (como na E25).
 */
async function escolhaDoPedido(db: DbOuTx, achadas: Candidata[], codigoLido: string): Promise<ResultadoRecebimento> {
  const esperando = achadas.filter((d) => A_RECEBER.includes(d.status));
  if (esperando.length > 0) return { tipo: 'escolher', codigoLido, ids: esperando.map((d) => d.id), achadaPor: 'PEDIDO_ML' };
  const atual = await maisRecenteEntre(db, achadas.map((d) => d.id));
  if (!atual) return { tipo: 'nao_encontrada', rastreio: codigoLido };
  // Releitura: a devolução pode ter voltado a esperar o pacote entre a busca e agora; a pessoa lê de novo.
  if (A_RECEBER.includes(atual.status)) throw new ErroDevolucao('A situação desta devolução mudou agora. Leia o pacote de novo.');
  if (BLOQUEADAS.includes(atual.status)) return { tipo: 'bloqueada', codigo: atual.codigo, status: atual.status, achadaPor: 'PEDIDO_ML' };
  return { tipo: 'ja_recebida', codigo: atual.codigo, status: atual.status, recebidaEm: atual.recebidaEm, achadaPor: 'PEDIDO_ML' };
}

/**
 * Recepção física (spec §6.2): o rastreio lido move a devolução de "Pendente de chegada" para
 * "Aguardando conferência" e registra data, hora e usuário. É a única coisa que move a etapa 1 (spec §5.2).
 * (extra, E25) O pacote "No CD do marketplace" que o ML mandou de volta também chega por aqui; o evento guarda isso.
 * (extra, E25) Sem nenhum rastreio igual, o código só de dígitos é procurado como número do pedido e do envio do ML
 * (`procurar`); todas as devoluções achadas que ainda não chegaram são recebidas juntas, como no rastreio repetido.
 * (extra, E27) Menos pelo número do pedido: aí nada é registrado sozinho. A resposta é `escolher`, com as devoluções do
 * pedido que esperam o pacote, e a chegada só é registrada quando a pessoa toca numa delas (`darChegadaPeloPedido`).
 *
 * Duas leituras simultâneas (dois celulares): dentro da transação o status é relido com trava (SELECT … FOR UPDATE),
 * então só uma leitura registra a chegada e grava o evento; a outra recebe `ja_recebida`. A mesma releitura cobre a
 * sincronização do ML que, entre a busca e o registro, troca "Pendente de chegada" e "No CD do marketplace" entre si:
 * vale o status de agora.
 */
export async function receberPorRastreio(
  db: DbOuTx,
  rastreioBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoRecebimento> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, MENSAGEM_PERFIL);
  const rastreio = rastreioOuErro(rastreioBruto);
  const { achadas, achadaPor } = await procurar(db, rastreio);
  if (achadas.length === 0) return { tipo: 'nao_encontrada', rastreio };
  if (achadaPor === 'PEDIDO_ML') return escolhaDoPedido(db, achadas, rastreio);
  const comoAchou = achadaPor ? { achadaPor } : {};
  // O evento guarda o código lido: no campo `rastreio` quando foi o rastreio, como sempre; senão, com a regra que achou.
  const lido = achadaPor ? { codigoLido: rastreio, achadaPor } : { rastreio };

  const aReceber = achadas.filter((d) => A_RECEBER.includes(d.status));
  if (aReceber.length > 0) {
    const recebidas = await db.transaction(async (tx) => {
      const feitas: { codigo: string; doArmazemML: boolean }[] = [];
      for (const d of aReceber) {
        // O status de agora, com trava: outra leitura pode ter acabado de registrar a chegada (fica a dela), e a
        // sincronização do ML pode ter trocado Pendente e No CD entre si, ou cancelado (fica para o fallback).
        const [linha] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, d.id)).for('update');
        if (!linha || !A_RECEBER.includes(linha.status)) continue;
        const de = linha.status;
        exigirTransicao({ de, para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, MENSAGEM_PERFIL);
        const [atualizada] = await tx
          .update(devolucoes)
          .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: usuario.id, atualizadaEm: agora })
          .where(and(eq(devolucoes.id, d.id), eq(devolucoes.status, de)))
          .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
        if (!atualizada) continue; // não acontece com a trava; fica por segurança
        const doArmazemML = de === 'NO_CD_MARKETPLACE';
        await registrarEvento(tx, {
          entidade: 'devolucao',
          entidadeId: atualizada.id,
          acao: 'recebida',
          de,
          para: 'AGUARDANDO_CONFERENCIA',
          usuarioId: usuario.id,
          dados: { ...lido, ...(doArmazemML ? { voltouDoArmazemML: true } : {}) },
          em: agora,
        });
        feitas.push({ codigo: atualizada.codigo, doArmazemML });
      }
      return feitas;
    });
    if (recebidas.length > 0) {
      const doArmazemML = recebidas.filter((r) => r.doArmazemML).map((r) => r.codigo);
      return {
        tipo: 'recebidas',
        codigos: recebidas.map((r) => r.codigo),
        em: agora,
        ...comoAchou,
        ...(doArmazemML.length > 0 ? { doArmazemML } : {}),
      };
    }
  }

  const atual = await maisRecenteEntre(db, achadas.map((d) => d.id));
  if (!atual) return { tipo: 'nao_encontrada', rastreio };
  // Defensivo: nada foi registrado e a devolução está esperando o pacote de novo, ou seja, o status mudou agora. Dizer
  // "Este pacote já chegou" seria falso (a chegada não foi registrada).
  if (A_RECEBER.includes(atual.status)) throw new ErroDevolucao('A situação desta devolução mudou agora. Leia o pacote de novo.');
  if (BLOQUEADAS.includes(atual.status)) return { tipo: 'bloqueada', codigo: atual.codigo, status: atual.status, ...comoAchou };
  return { tipo: 'ja_recebida', codigo: atual.codigo, status: atual.status, recebidaEm: atual.recebidaEm, ...comoAchou };
}

/**
 * (extra, E27) Só o número do pedido do ML (o campo da etiqueta amarela na Retirada do Full): a regra 2 da E25, sem o
 * rastreio nem o número do envio. Nada é registrado; a resposta é a mesma do Recebimento pelo pedido.
 */
export async function procurarPeloPedidoML(db: DbOuTx, codigoBruto: string, usuario: UsuarioSessao): Promise<ResultadoRecebimento> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, MENSAGEM_PERFIL);
  const codigo = normalizarRastreio(codigoBruto);
  if (!codigo) throw new ErroDevolucao('Digite o número do pedido.');
  if (pedidosDoCodigo(codigo).length === 0) throw new ErroDevolucao('O número do pedido tem só algarismos.');
  const achadas = await devolucoesDoPedidoML(db, codigo);
  if (achadas.length === 0) return { tipo: 'nao_encontrada', rastreio: codigo };
  return escolhaDoPedido(db, achadas, codigo);
}

/**
 * (extra, E27) "Dar chegada": registra a chegada de UMA devolução, a que a pessoa tocou na ficha (ou na lista) das
 * devoluções achadas pelo número do pedido. Mantém as garantias da E25: o status é relido com trava (SELECT … FOR
 * UPDATE) e vale o de agora (Pendente de chegada ou No CD → Aguardando conferência); de dois toques (dois celulares) só
 * um registra, e o outro recebe `ja_recebida`; Cancelada e Extraviada ficam bloqueadas.
 *
 * O id vem da tela: a devolução precisa ser do ML e ter o pedido lido (o número inteiro, como na busca). Assim um id de
 * outra devolução nunca registra a chegada.
 *
 * Histórico: a ação continua `recebida`, com `codigoLido` e `achadaPor: 'PEDIDO_ML'`, `voltouDoArmazemML` quando estava
 * No CD e `retiradaFull` (o código RF-…) quando a chegada veio da etiqueta amarela da Retirada do Full.
 */
export async function darChegadaPeloPedido(
  db: DbOuTx,
  p: { devolucaoId: string; codigoLido: string; retiradaFull?: string },
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoRecebimento> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, MENSAGEM_PERFIL);
  const codigoLido = normalizarRastreio(p.codigoLido);
  const pedidos = pedidosDoCodigo(codigoLido);
  if (pedidos.length === 0) throw new ErroDevolucao('Leia o número do pedido de novo.');
  if (!ehUuid(p.devolucaoId)) throw new ErroDevolucao('Devolução não encontrada.');
  return db.transaction(async (tx): Promise<ResultadoRecebimento> => {
    const [linha] = await tx
      .select({
        codigo: devolucoes.codigo,
        status: devolucoes.status,
        canal: devolucoes.canal,
        pedidos: devolucoes.pedidosExternos,
        recebidaEm: devolucoes.recebidaEm,
      })
      .from(devolucoes)
      .where(eq(devolucoes.id, p.devolucaoId))
      .for('update');
    if (!linha) throw new ErroDevolucao('Devolução não encontrada.');
    if (linha.canal !== 'MERCADO_LIVRE' || !linha.pedidos.some((x) => pedidos.includes(x))) {
      throw new ErroDevolucao('Esta devolução não é deste pedido. Leia o número do pedido de novo.');
    }
    if (BLOQUEADAS.includes(linha.status)) return { tipo: 'bloqueada', codigo: linha.codigo, status: linha.status, achadaPor: 'PEDIDO_ML' };
    if (!A_RECEBER.includes(linha.status)) {
      return { tipo: 'ja_recebida', codigo: linha.codigo, status: linha.status, recebidaEm: linha.recebidaEm, achadaPor: 'PEDIDO_ML' };
    }
    const de = linha.status;
    exigirTransicao({ de, para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, MENSAGEM_PERFIL);
    await tx
      .update(devolucoes)
      .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: usuario.id, atualizadaEm: agora })
      .where(and(eq(devolucoes.id, p.devolucaoId), eq(devolucoes.status, de)));
    const doArmazemML = de === 'NO_CD_MARKETPLACE';
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: p.devolucaoId,
      acao: 'recebida',
      de,
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      dados: {
        codigoLido,
        achadaPor: 'PEDIDO_ML',
        ...(doArmazemML ? { voltouDoArmazemML: true } : {}),
        ...(p.retiradaFull ? { retiradaFull: p.retiradaFull } : {}),
      },
      em: agora,
    });
    return {
      tipo: 'recebidas',
      codigos: [linha.codigo],
      em: agora,
      achadaPor: 'PEDIDO_ML',
      ...(doArmazemML ? { doArmazemML: [linha.codigo] } : {}),
    };
  });
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
  return db.transaction(async (tx) => {
    // Trava por rastreio, espaço 1 (a gestão de usuários usa o 2); sem índice único: várias devoluções podem dividir um rastreio). Serializa duas leituras
    // simultâneas de um código novo: a segunda enxerga a linha da primeira e recusa.
    await tx.execute(sql`select pg_advisory_xact_lock(1, hashtext(${rastreio}))`);
    const existente = await maisRecentePorRastreio(tx, rastreio);
    if (existente) throw new ErroDevolucao(`Já existe a devolução ${existente.codigo} com este rastreio. Registre a chegada por ela.`);
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
