import { armazenamentoDoProvedor } from './armazenamento';
import { DURACAO_LINK_SEGUNDOS } from './dominio';

/** Links temporários (10 min, spec §9) das evidências prontas, cada uma no provedor onde está (contrato D2). */
export async function linksDasEvidencias(
  evidencias: { id: string; situacao: string; caminho: string | null; provedor: string | null }[],
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const e of evidencias) {
    if (e.situacao !== 'PRONTA' || !e.caminho || !e.provedor) continue;
    links.set(e.id, await armazenamentoDoProvedor(e.provedor).urlTemporaria(e.caminho, DURACAO_LINK_SEGUNDOS));
  }
  return links;
}
