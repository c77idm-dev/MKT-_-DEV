import type { DbOuTx } from '@/db/client';
import type { Perfil } from '@/modules/auth/perfis';
import type { TomSelo } from '@/modules/devolucoes/selos';
import { obterContaML } from '@/modules/mercado-livre/contas';
import { sincronizacaoAtrasada } from '@/modules/mercado-livre/dominio';
import {
  contarSemFornecedor, contestacoesComPrazoVencendo, devolucoesComAlertaLote, devolucoesComMLEncerradoAposChegada,
  devolucoesComPrazoVencendo, devolucoesEntreguesSemLeitura, lotesComAlertaNfCancelada, notasRejeitadas,
} from './alertas-devolucoes';
import { alertasDoPerfil, DEFINICAO_ALERTA, discoQuaseCheio, percentualUso, type IdAlerta, type UsoDisco } from './alertas-regras';
import { backupEstaAtrasado } from './backup';
import { usoDiscoMidia } from './disco';
import { contarFalhasAbertas } from './falhas';

export type AlertaPainel = { id: IdAlerta; titulo: string; quantidade: number | null; detalhe: string | null; tom: TomSelo; href: string };
export type FontesAlertas = { usoDisco?: () => Promise<UsoDisco | null> };

type Resultado = { quantidade: number | null; detalhe?: string | null } | null;

async function calcular(id: IdAlerta, db: DbOuTx, perfil: Perfil, agora: Date, fontes: FontesAlertas): Promise<Resultado> {
  const contagem = (n: number): Resultado => (n > 0 ? { quantidade: n } : null);
  const condicao = (ativo: boolean): Resultado => (ativo ? { quantidade: null } : null);
  switch (id) {
    case 'prazo_ml': {
      const devs = await devolucoesComPrazoVencendo(db, agora);
      const contestacoes = perfil === 'GESTOR' ? await contestacoesComPrazoVencendo(db, agora) : [];
      return contagem(devs.length + contestacoes.length);
    }
    case 'nf_rejeitada': {
      const n = await notasRejeitadas(db);
      return contagem(n.devolucaoIds.length + n.lotes.length);
    }
    case 'conta_ml_reconectar':
      return condicao((await obterContaML(db))?.situacao === 'RECONECTAR');
    case 'sincronizacao_ml': {
      const conta = await obterContaML(db);
      return condicao(conta?.situacao === 'ATIVA' && sincronizacaoAtrasada(conta.ultimaSincronizacaoEm ?? conta.conectadaEm, agora));
    }
    case 'sem_fornecedor':
      return contagem(await contarSemFornecedor(db));
    case 'entregue_sem_leitura':
      return contagem((await devolucoesEntreguesSemLeitura(db, agora)).length);
    case 'ml_status_apos_chegada':
      return contagem((await devolucoesComMLEncerradoAposChegada(db, agora)).length);
    case 'lote_nf_cancelada':
      return contagem((await devolucoesComAlertaLote(db, agora)).length + (await lotesComAlertaNfCancelada(db, agora)).length);
    case 'falhas':
      return contagem(await contarFalhasAbertas(db));
    case 'backup':
      return condicao(await backupEstaAtrasado(db, agora));
    case 'disco': {
      const uso = await (fontes.usoDisco ?? usoDiscoMidia)();
      return uso && discoQuaseCheio(uso) ? { quantidade: null, detalhe: `${Math.round(percentualUso(uso))}% em uso` } : null;
    }
  }
}

/** Os alertas ativos do perfil, na ordem de prioridade. Só consulta o que o perfil vê. */
export async function carregarAlertas(db: DbOuTx, perfil: Perfil, agora: Date = new Date(), fontes: FontesAlertas = {}): Promise<AlertaPainel[]> {
  const ids = alertasDoPerfil(perfil);
  const resultados = await Promise.all(ids.map((id) => calcular(id, db, perfil, agora, fontes)));
  return ids.flatMap((id, i) => {
    const r = resultados[i];
    if (!r) return [];
    const def = DEFINICAO_ALERTA[id];
    return [{ id, titulo: def.titulo, quantidade: r.quantidade, detalhe: r.detalhe ?? null, tom: def.tom, href: def.href }];
  });
}

export type DetalheAlerta = { id: IdAlerta; titulo: string; devolucaoIds: string[]; links: { texto: string; href: string }[] };

const linkLote = (codigo: string) => ({ texto: codigo, href: `/lotes/${codigo}` });

async function detalhar(id: IdAlerta, db: DbOuTx, perfil: Perfil, agora: Date): Promise<Pick<DetalheAlerta, 'devolucaoIds' | 'links'>> {
  switch (id) {
    case 'prazo_ml': {
      const contestacoes = perfil === 'GESTOR' ? await contestacoesComPrazoVencendo(db, agora) : [];
      return {
        devolucaoIds: await devolucoesComPrazoVencendo(db, agora),
        links: contestacoes.map((c) => ({ texto: `Contestação da ${c.devolucaoCodigo}`, href: `/contestacoes/${c.id}` })),
      };
    }
    case 'nf_rejeitada': {
      const n = await notasRejeitadas(db);
      return { devolucaoIds: n.devolucaoIds, links: n.lotes.map((l) => linkLote(l.codigo)) };
    }
    case 'entregue_sem_leitura':
      return { devolucaoIds: await devolucoesEntreguesSemLeitura(db, agora), links: [] };
    case 'ml_status_apos_chegada':
      return { devolucaoIds: await devolucoesComMLEncerradoAposChegada(db, agora), links: [] };
    case 'lote_nf_cancelada': {
      const codigos = await lotesComAlertaNfCancelada(db, agora);
      return { devolucaoIds: await devolucoesComAlertaLote(db, agora), links: codigos.map((l) => linkLote(l.codigo)) };
    }
    default:
      return { devolucaoIds: [], links: [] };
  }
}

/** O que a página /fluxo/alertas lista: só os alertas que apontam devoluções (ou lotes e contestações) e que o perfil vê. */
export async function detalhesDosAlertas(db: DbOuTx, perfil: Perfil, agora: Date = new Date()): Promise<DetalheAlerta[]> {
  const ids = alertasDoPerfil(perfil);
  const todos = await Promise.all(ids.map(async (id) => ({ id, ...(await detalhar(id, db, perfil, agora)) })));
  return todos
    .filter((d) => d.devolucaoIds.length > 0 || d.links.length > 0)
    .map((d) => ({ ...d, titulo: DEFINICAO_ALERTA[d.id].titulo }));
}
