import { describe, expect, it } from 'vitest';
import { verificarLinkPublico } from '@/modules/midia/links-publicos';
import { dadosDossieTeste } from '../../../tests/helpers/fabricas-dossie';
import type { EvidenciaDossie } from './dominio';
import { linksDasProvas } from './links';

const SEGREDO = 's'.repeat(32);
const AGORA = new Date('2026-11-24T12:00:00Z');
const ORIGEM = 'https://devolucoes.exemplo.com.br';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** As evidências da fábrica com ids de verdade (UUID), como vêm do banco. */
function evidencias(): EvidenciaDossie[] {
  return dadosDossieTeste().evidencias.map((e, i) => ({ ...e, id: uuid(i + 1) }));
}

describe('linksDasProvas (E28)', () => {
  it('foto: o arquivo; vídeo: a página que toca; cada link assinado para a evidência, valendo 90 dias', () => {
    const lista = evidencias();
    const links = linksDasProvas(lista, { origem: ORIGEM, segredo: SEGREDO, agora: AGORA });
    expect(links.size).toBe(lista.length);
    for (const e of lista) {
      const url = new URL(links.get(e.id)!);
      expect(url.origin).toBe(ORIGEM);
      expect(url.pathname).toBe(e.tipo === 'VIDEO_PROVA' ? '/api/provas/video' : '/api/provas/arquivo');
      const p = url.searchParams;
      expect([...p.keys()]).toEqual(['e', 'exp', 'sig']);
      expect(verificarLinkPublico(SEGREDO, { e: p.get('e'), exp: p.get('exp'), sig: p.get('sig') }, AGORA)).toEqual({
        ok: true,
        evidenciaId: e.id,
        expiraEm: AGORA.getTime() / 1000 + 90 * 24 * 3600,
      });
      // Nada da chave do armazenamento no link.
      expect(links.get(e.id)).not.toContain('evidencias');
    }
  });

  it('sem o endereço público: nenhum link (o PDF sai sem eles)', () => {
    expect(linksDasProvas(evidencias(), { origem: null, segredo: SEGREDO, agora: AGORA }).size).toBe(0);
  });

  it('só a prova pronta no disco local: em processamento, falhou, apagada ou no S3, sem link', () => {
    const lista = evidencias();
    lista[0] = { ...lista[0], situacao: 'PROCESSANDO', caminho: null };
    lista[1] = { ...lista[1], situacao: 'APAGADA' };
    lista[2] = { ...lista[2], provedor: 's3' };
    lista[3] = { ...lista[3], provedor: null };
    lista[4] = { ...lista[4], caminho: null };
    lista[5] = { ...lista[5], id: 'nao-e-uuid' };
    const links = linksDasProvas(lista, { origem: ORIGEM, segredo: SEGREDO, agora: AGORA });
    expect([...links.keys()]).toEqual(lista.slice(6).map((e) => e.id));
  });
});
