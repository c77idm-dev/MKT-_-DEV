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
  if (local) return estadoLocal(local);
  const servidor = p.evidencias.find(naVaga(vaga));
  const concluido = p.concluidos.find(naVaga(vaga));
  if (concluido && servidor?.id !== concluido.evidenciaId) return { tipo: 'enviada', pronta: false, url: null };
  if (!servidor || servidor.situacao === 'APAGADA') return { tipo: 'vazio' };
  return estadoServidor(servidor);
}

function estadoLocal(local: RegistroEnvio): EstadoSlot {
  if (local.estado === 'erro') return { tipo: 'nao_enviada', mensagem: local.mensagem ?? 'O arquivo não foi enviado.', registro: local };
  if (local.estado === 'pendente' && local.tentativas > 0) return { tipo: 'aguardando', mensagem: local.mensagem ?? 'Aguardando conexão.', registro: local };
  return { tipo: 'enviando', progresso: local.progresso, registro: local };
}

function estadoServidor(servidor: EvidenciaServidor): EstadoSlot {
  if (servidor.situacao === 'FALHOU') return { tipo: 'falhou', mensagem: servidor.erro ?? 'O servidor não conseguiu processar o arquivo.' };
  return { tipo: 'enviada', pronta: servidor.situacao === 'PRONTA', url: servidor.url };
}

/** Uma foto da avaria (EXTRA) da unidade. `alvo` diz como remover: da fila do aparelho ou do servidor. */
export type FotoExtra = {
  chave: string;
  estado: EstadoSlot;
  alvo: { tipo: 'local'; idCliente: string } | { tipo: 'servidor'; evidenciaId: string };
};

/**
 * Melhoria 2: as fotos da avaria de uma unidade, na ordem em que foram tiradas: as que o servidor tem, as confirmadas
 * nesta tela que o servidor ainda não mostra e as que estão no aparelho. `removidas`: ids já removidos nesta tela
 * (somem antes de a página recarregar).
 */
export function fotosExtras(
  itemId: string,
  p: { envios: RegistroEnvio[]; concluidos: EnvioConcluido[]; evidencias: EvidenciaServidor[] },
  removidas: ReadonlySet<string>,
): FotoExtra[] {
  const daUnidade = (x: Vaga) => x.tipo === 'EXTRA' && x.itemId === itemId;
  const noServidor = new Set(p.evidencias.map((e) => e.id));
  const concluidos = p.concluidos.filter(daUnidade);
  const jaConcluidos = new Set(concluidos.map((c) => c.idCliente));
  return [
    ...p.evidencias
      .filter((e) => daUnidade(e) && e.situacao !== 'APAGADA' && !removidas.has(e.id))
      .map((e): FotoExtra => ({ chave: e.id, estado: estadoServidor(e), alvo: { tipo: 'servidor', evidenciaId: e.id } })),
    ...concluidos
      .filter((c) => !noServidor.has(c.evidenciaId) && !removidas.has(c.evidenciaId))
      .map((c): FotoExtra => ({ chave: c.evidenciaId, estado: { tipo: 'enviada', pronta: false, url: null }, alvo: { tipo: 'servidor', evidenciaId: c.evidenciaId } })),
    ...p.envios
      .filter((r) => daUnidade(r) && !jaConcluidos.has(r.idCliente))
      .sort((a, b) => a.criadoEm - b.criadoEm)
      .map((r): FotoExtra => ({ chave: r.idCliente, estado: estadoLocal(r), alvo: { tipo: 'local', idCliente: r.idCliente } })),
  ];
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
