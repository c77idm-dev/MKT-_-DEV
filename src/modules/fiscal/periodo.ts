import { interpretarData } from '@/lib/valores';

/** Decisão 10: até 31 dias por ZIP (o arquivo é montado na memória). */
export const DIAS_MAXIMOS_ZIP = 31;

/** Mensagens da etapa 4 quando a rota do ZIP volta com ?xmls=. */
export const MENSAGEM_ERRO_XMLS: Record<string, string> = {
  periodo: 'Período inválido: escolha "De" antes de "Até", com no máximo 31 dias.',
  vazio: 'Nenhum XML de NF autorizada ou cancelada nesse período.',
};

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Do dia 1 do mês até hoje, no horário de Brasília (valores iniciais do formulário). */
export function periodoDoMesAtual(agora: Date = new Date()): { de: string; ate: string } {
  const hoje = DIA.format(agora);
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

export function validarPeriodo(de: string, ate: string): boolean {
  if (interpretarData(de) !== de || interpretarData(ate) !== ate) return false;
  const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;
  return dias >= 0 && dias < DIAS_MAXIMOS_ZIP;
}
