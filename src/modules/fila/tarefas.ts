/** Tarefas de fundo de todas as fases (contrato §5.1). Tarefa nova só por emenda ao contrato. */
export type DadosTarefa = {
  'midia.processar-foto': { evidenciaId: string }; // 2: hash, carimbo (extra), envio ao armazenamento final
  'midia.transcodificar': { evidenciaId: string }; // 2: ffmpeg H.264 720p (spec §9)
  'limpeza.temporarios': Record<string, never>; // 2 (extra): uploads tus abandonados e importações não confirmadas
  'ml.sincronizar-reclamacao': { claimId: string }; // 3
  'ml.varredura': Record<string, never>; // 3
  'ml.renovar-token': Record<string, never>; // 3
  'ml.enviar-resultado': { devolucaoId: string }; // 3 (enviada pela 2 ao concluir)
  'ml.enviar-contestacao': { contestacaoId: string }; // 3
  'nfe.emitir': { notaFiscalId: string }; // 4
  'nfe.consultar': { notaFiscalId: string; consulta: number }; // 4 (reagenda a si mesma com espera crescente)
  'lotes.alocar-pendentes': Record<string, never>; // 5 (uma vez, na subida do worker)
  'midia.retencao': Record<string, never>; // 6
};
export type NomeTarefa = keyof DadosTarefa;

export type ConfigTarefa = { tentativas: number; expiraEmSegundos: number; agenda?: string };

const PADRAO: ConfigTarefa = { tentativas: 5, expiraEmSegundos: 300 };

/** Spec §11: 5 tentativas com espera crescente; depois, a tarefa vai para Falhas (Fase 6). */
export const CONFIG_TAREFAS: Record<NomeTarefa, ConfigTarefa> = {
  'midia.processar-foto': PADRAO,
  // Transcodificar 1 min de vídeo leva até ~3 min numa vCPU (pesquisa §6.3); 1 hora evita reexecução no meio.
  'midia.transcodificar': { tentativas: 5, expiraEmSegundos: 3600 },
  'limpeza.temporarios': { ...PADRAO, agenda: '30 3 * * *' },
  'ml.sincronizar-reclamacao': PADRAO,
  'ml.varredura': { ...PADRAO, agenda: '*/15 * * * *' },
  'ml.renovar-token': { ...PADRAO, agenda: '0 */5 * * *' },
  'ml.enviar-resultado': PADRAO,
  'ml.enviar-contestacao': PADRAO,
  'nfe.emitir': PADRAO,
  'nfe.consultar': PADRAO,
  'lotes.alocar-pendentes': PADRAO,
  'midia.retencao': { ...PADRAO, agenda: '0 3 * * *' },
};

export const NOMES_TAREFAS = Object.keys(CONFIG_TAREFAS) as NomeTarefa[];

/** As agendas (cron) valem no horário de Brasília. */
export const FUSO_AGENDAS = 'America/Sao_Paulo';

/** Enviadas uma vez quando o worker sobe (se a fase dona já tiver manipulador). */
export const TAREFAS_NA_SUBIDA = ['lotes.alocar-pendentes'] as const satisfies readonly NomeTarefa[];
