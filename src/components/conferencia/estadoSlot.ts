import type { EnvioConcluido, RegistroEnvio } from '@/components/midia/filaEnvios';
import type { EvidenciaRegra } from '@/modules/conferencia/regras';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';

/** O que o servidor tem de cada evidência (a página manda com o link temporário das que estão prontas). */
export type EvidenciaServidor = {
  id: string;
  tipo: TipoEvidencia;
  itemId: string | null;
  situacao: SituacaoProcessamento;
  url: string | null;
  erro: string | null;
};

export type EstadoSlot =
  | { tipo: 'vazio' }
  | { tipo: 'enviando'; progresso: number; registro: RegistroEnvio }
  | { tipo: 'aguardando'; mensagem: string; registro: RegistroEnvio }
  | { tipo: 'nao_enviada'; mensagem: string; registro: RegistroEnvio }
  | { tipo: 'enviada'; pronta: boolean; url: string | null }
  | { tipo: 'falhou'; mensagem: string };

type Vaga = { tipo: TipoEvidencia; itemId: string | null };
const naVaga = (v: Vaga) => (x: Vaga) => x.tipo === v.tipo && x.itemId === v.itemId;

/** O arquivo no aparelho (mais novo) vence; depois, o confirmado nesta tela; depois, o que o servidor tem. */
export function estadoDoSlot(
  vaga: Vaga,
  p: { envios: RegistroEnvio[]; concluidos: EnvioConcluido[]; evidencias: EvidenciaServidor[] },
): EstadoSlot {
  const local = p.envios.filter(naVaga(vaga)).sort((a, b) => b.criadoEm - a.criadoEm)[0];
  if (local) {
    if (local.estado === 'erro') return { tipo: 'nao_enviada', mensagem: local.mensagem ?? 'O arquivo não foi enviado.', registro: local };
    if (local.estado === 'pendente' && local.tentativas > 0) return { tipo: 'aguardando', mensagem: local.mensagem ?? 'Aguardando conexão.', registro: local };
    return { tipo: 'enviando', progresso: local.progresso, registro: local };
  }
  const servidor = p.evidencias.find(naVaga(vaga));
  const concluido = p.concluidos.find(naVaga(vaga));
  if (concluido && servidor?.id !== concluido.evidenciaId) return { tipo: 'enviada', pronta: false, url: null };
  if (!servidor || servidor.situacao === 'APAGADA') return { tipo: 'vazio' };
  if (servidor.situacao === 'FALHOU') return { tipo: 'falhou', mensagem: servidor.erro ?? 'O servidor não conseguiu processar o arquivo.' };
  return { tipo: 'enviada', pronta: servidor.situacao === 'PRONTA', url: servidor.url };
}

export function textoDoSlot(e: EstadoSlot): string {
  switch (e.tipo) {
    case 'vazio':
      return 'Falta';
    case 'enviando':
      return `Enviando… ${Math.round(e.progresso * 100)}%`;
    case 'aguardando':
      return 'Aguardando conexão';
    case 'nao_enviada':
      return 'Não enviada';
    case 'enviada':
      return e.pronta ? 'Pronta' : 'Enviada · processando';
    case 'falhou':
      return 'Falhou no servidor: tire de novo';
  }
}

/** Para a lista do que falta: as que o servidor tem (sem as que falharam) e as confirmadas nesta tela. */
export function evidenciasQueContam(evidencias: EvidenciaServidor[], concluidos: EnvioConcluido[]): EvidenciaRegra[] {
  return [
    ...evidencias.filter((e) => e.situacao !== 'FALHOU' && e.situacao !== 'APAGADA').map(({ tipo, itemId }) => ({ tipo, itemId })),
    ...concluidos.map(({ tipo, itemId }) => ({ tipo, itemId })),
  ];
}
