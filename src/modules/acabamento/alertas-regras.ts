import type { Perfil } from '@/modules/auth/perfis';
import type { TomSelo } from '@/modules/devolucoes/selos';

/** Spec §6.0.1 e decisão 9 da Fase 6: quem vê cada alerta do painel, na ordem de prioridade. */
export const IDS_ALERTA = [
  'prazo_ml',
  'respostas_ml',
  'nf_rejeitada',
  'conta_ml_reconectar',
  'conta_bitbrain_indisponivel',
  'sincronizacao_ml',
  'sem_fornecedor',
  'entregue_sem_leitura',
  'ml_status_apos_chegada',
  'lote_nf_cancelada',
  'falhas',
  'backup',
  'disco',
] as const;
export type IdAlerta = (typeof IDS_ALERTA)[number];

type Definicao = { titulo: string; perfis: readonly Perfil[]; tom: TomSelo; href: string };

export const DEFINICAO_ALERTA: Record<IdAlerta, Definicao> = {
  prazo_ml: { titulo: 'Prazo do ML vencendo', perfis: ['OPERADOR', 'GESTOR'], tom: 'erro', href: '/fluxo/alertas#prazo_ml' },
  respostas_ml: { titulo: 'Respostas para dar no ML', perfis: ['GESTOR'], tom: 'atencao', href: '/contestacoes' },
  nf_rejeitada: { titulo: 'NF rejeitada', perfis: ['FISCAL', 'GESTOR'], tom: 'erro', href: '/fluxo/alertas#nf_rejeitada' },
  conta_ml_reconectar: {
    titulo: 'Conta do Mercado Livre precisa ser reconectada',
    perfis: ['GESTOR'],
    tom: 'erro',
    href: '/configuracoes/mercado-livre',
  },
  conta_bitbrain_indisponivel: {
    titulo: 'Conta do ML indisponível no Bitbrain',
    perfis: ['GESTOR'],
    tom: 'erro',
    href: '/configuracoes/mercado-livre',
  },
  sincronizacao_ml: {
    titulo: 'Sincronização com o ML parada há mais de 1 h',
    perfis: ['GESTOR'],
    tom: 'atencao',
    href: '/configuracoes/mercado-livre',
  },
  sem_fornecedor: { titulo: 'Itens sem fornecedor', perfis: ['FISCAL', 'GESTOR'], tom: 'atencao', href: '/lotes/sem-fornecedor' },
  entregue_sem_leitura: {
    titulo: 'Entregue (ML) sem leitura física',
    perfis: ['OPERADOR', 'GESTOR'],
    tom: 'atencao',
    href: '/fluxo/alertas#entregue_sem_leitura',
  },
  ml_status_apos_chegada: {
    titulo: 'Status do ML mudou depois da chegada',
    perfis: ['GESTOR'],
    tom: 'erro',
    href: '/fluxo/alertas#ml_status_apos_chegada',
  },
  lote_nf_cancelada: {
    titulo: 'NF cancelada com o lote já adiante',
    perfis: ['FISCAL', 'GESTOR'],
    tom: 'erro',
    href: '/fluxo/alertas#lote_nf_cancelada',
  },
  falhas: { titulo: 'Tarefas em Falhas', perfis: ['GESTOR'], tom: 'erro', href: '/configuracoes/falhas' },
  backup: { titulo: 'Backup diário atrasado', perfis: ['GESTOR'], tom: 'erro', href: '/configuracoes/falhas' },
  disco: { titulo: 'Disco do servidor quase cheio', perfis: ['GESTOR'], tom: 'atencao', href: '/configuracoes/conferencia' },
};

export function alertasDoPerfil(perfil: Perfil): IdAlerta[] {
  return IDS_ALERTA.filter((id) => DEFINICAO_ALERTA[id].perfis.includes(perfil));
}

/** Decisão 11: prazo em até 24 h, ou já vencido. Mesma regra do selo do cartão. */
export const PRAZO_VENCENDO_MS = 24 * 60 * 60 * 1000;
export function prazoVencendo(prazo: Date, agora: Date): boolean {
  return prazo.getTime() - agora.getTime() <= PRAZO_VENCENDO_MS;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Meia-noite UTC da data civil de Brasília. */
function diaCivil(d: Date): number {
  const [ano, mes, dia] = FORMATO_DIA.format(d).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/**
 * Decisão 12: dias úteis (segunda a sexta, sem feriados) no intervalo (dia da entrega, dia de hoje], no fuso de
 * Brasília. Entregue na sexta, segunda = 1 e terça = 2.
 */
export function diasUteisDepois(entrega: Date, agora: Date): number {
  const fim = diaCivil(agora);
  let total = 0;
  for (let dia = diaCivil(entrega) + UM_DIA_MS; dia <= fim; dia += UM_DIA_MS) {
    const semana = new Date(dia).getUTCDay();
    if (semana !== 0 && semana !== 6) total += 1;
  }
  return total;
}

/** Decisão 10: alertas que nascem de um evento ficam 7 dias. */
export const JANELA_ALERTA_EVENTO_MS = 7 * 24 * 60 * 60 * 1000;

export type UsoDisco = { totalBytes: number; livreBytes: number };
export function percentualUso(u: UsoDisco): number {
  if (u.totalBytes <= 0) return 0;
  return ((u.totalBytes - u.livreBytes) / u.totalBytes) * 100;
}
export function discoQuaseCheio(u: UsoDisco): boolean {
  return percentualUso(u) > 85;
}

export const LIMITE_BACKUP_MS = 26 * 60 * 60 * 1000;
/** Só alerta depois do primeiro registro de backup (antes disso o serviço pode nem ter sido ligado). */
export function backupAtrasado(ultimoOk: Date | null, jaHouveBackup: boolean, agora: Date): boolean {
  if (!jaHouveBackup) return false;
  if (!ultimoOk) return true;
  return agora.getTime() - ultimoOk.getTime() > LIMITE_BACKUP_MS;
}
