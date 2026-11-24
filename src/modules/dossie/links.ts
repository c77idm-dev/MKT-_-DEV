import type { OrigemAvaliada } from '@/lib/origem-publica';
import { CAMINHO_PROVA_ARQUIVO, CAMINHO_PROVA_VIDEO, parametrosLinkPublico } from '@/modules/midia/links-publicos';
import type { EvidenciaDossie } from './dominio';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A prova que ganha link quando há o endereço público: PRONTA no disco local e com id de verdade. A rota pública lê
 * do disco, então a que está no S3 (ou sem arquivo) fica sem link.
 */
function podeTerLink(e: EvidenciaDossie): boolean {
  return e.situacao === 'PRONTA' && !!e.caminho && e.provedor === 'disco' && UUID.test(e.id);
}

/**
 * Os links públicos das provas do dossiê (E28): id da evidência → URL que abre sem login, por 90 dias. A foto abre o
 * arquivo (tamanho original); o vídeo, a página que o toca no navegador. Só a prova que pode ter link (podeTerLink).
 * Sem o endereço público (`origem` null: veja origemPublica), nenhum link: o PDF sai assim mesmo.
 */
export function linksDasProvas(
  evidencias: readonly EvidenciaDossie[],
  o: { origem: string | null; segredo: string; agora: Date },
): Map<string, string> {
  const links = new Map<string, string>();
  if (!o.origem) return links;
  for (const e of evidencias) {
    if (!podeTerLink(e)) continue;
    const caminho = e.tipo === 'VIDEO_PROVA' ? CAMINHO_PROVA_VIDEO : CAMINHO_PROVA_ARQUIVO;
    links.set(e.id, `${o.origem}${caminho}?${parametrosLinkPublico(o.segredo, e.id, o.agora).toString()}`);
  }
  return links;
}

/**
 * A linha do aviso "dossie_sem_links" (JSON, como os outros avisos do web) quando o pedido não deu o endereço público
 * e há provas que ganhariam link: o PDF sai sem eles, e a VPS precisa mostrar isso (por exemplo, um `location` do
 * nginx que perdeu o X-Forwarded-Proto). Só o código da devolução, o motivo e o número de provas: nada do cabeçalho
 * bruto. null quando não há o que avisar.
 */
export function avisoSemLinks(codigo: string, evidencias: readonly EvidenciaDossie[], origem: OrigemAvaliada, em: Date): string | null {
  if (origem.url !== null) return null;
  const provas = evidencias.filter(podeTerLink).length;
  if (provas === 0) return null;
  return JSON.stringify({ em: em.toISOString(), nivel: 'aviso', origem: 'web', evento: 'dossie_sem_links', codigo, motivo: origem.motivo, provas });
}
