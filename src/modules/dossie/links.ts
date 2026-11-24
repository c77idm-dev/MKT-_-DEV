import { CAMINHO_PROVA_ARQUIVO, CAMINHO_PROVA_VIDEO, parametrosLinkPublico } from '@/modules/midia/links-publicos';
import type { EvidenciaDossie } from './dominio';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Os links públicos das provas do dossiê (E28): id da evidência → URL que abre sem login, por 90 dias. A foto abre o
 * arquivo (tamanho original); o vídeo, a página que o toca no navegador. Só a prova PRONTA no disco local: a rota
 * pública lê do disco, então a que está no S3 (ou sem arquivo) fica sem link. Sem o endereço público (`origem` null:
 * veja origemPublica), nenhum link: o PDF sai assim mesmo.
 */
export function linksDasProvas(
  evidencias: readonly EvidenciaDossie[],
  o: { origem: string | null; segredo: string; agora: Date },
): Map<string, string> {
  const links = new Map<string, string>();
  if (!o.origem) return links;
  for (const e of evidencias) {
    if (e.situacao !== 'PRONTA' || !e.caminho || e.provedor !== 'disco' || !UUID.test(e.id)) continue;
    const caminho = e.tipo === 'VIDEO_PROVA' ? CAMINHO_PROVA_VIDEO : CAMINHO_PROVA_ARQUIVO;
    links.set(e.id, `${o.origem}${caminho}?${parametrosLinkPublico(o.segredo, e.id, o.agora).toString()}`);
  }
  return links;
}
