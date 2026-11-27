import { NOMES_TAREFAS, type NomeTarefa } from '../fila/tarefas';

export const SITUACOES_FALHA = ['ABERTA', 'REENVIADA', 'DISPENSADA'] as const;
export type SituacaoFalha = (typeof SITUACOES_FALHA)[number];
export const ROTULO_SITUACAO_FALHA: Record<SituacaoFalha, string> = {
  ABERTA: 'Aberta',
  REENVIADA: 'Reenviada',
  DISPENSADA: 'Dispensada',
};

export const SITUACOES_BACKUP = ['EM_ANDAMENTO', 'OK', 'FALHOU'] as const;
export type SituacaoBackup = (typeof SITUACOES_BACKUP)[number];

/** Nome em português de cada tarefa de fundo, para a tela Falhas. */
export const ROTULO_TAREFA: Record<NomeTarefa, string> = {
  'midia.processar-foto': 'Processar foto',
  'midia.transcodificar': 'Comprimir o Vídeo de Prova',
  'limpeza.temporarios': 'Limpeza de temporários',
  'ml.sincronizar-reclamacao': 'Sincronizar reclamação do Mercado Livre',
  'ml.varredura': 'Varredura do Mercado Livre',
  'ml.renovar-token': 'Renovar o acesso ao Mercado Livre',
  'ml.enviar-resultado': 'Enviar o resultado da conferência ao ML',
  'ml.enviar-contestacao': 'Enviar contestação ao ML',
  'nfe.emitir': 'Emitir NF-e',
  'nfe.consultar': 'Consultar NF-e',
  'lotes.alocar-pendentes': 'Alocar unidades pendentes nos lotes',
  'midia.retencao': 'Prazo de guarda das mídias',
  'apagadas.expurgo': 'Apagar de vez o que está em Apagadas há 90 dias',
};

export function ehNomeTarefa(texto: string): texto is NomeTarefa {
  return (NOMES_TAREFAS as readonly string[]).includes(texto);
}

/** Tamanho máximo do texto de erro guardado. */
export const ERRO_MAXIMO = 500;
