import { describe, expect, it } from 'vitest';
import { assinarLink, verificarLink } from './links';
import { assinarLinkPublico, DURACAO_LINK_PUBLICO_SEGUNDOS, parametrosLinkPublico, verificarLinkPublico } from './links-publicos';

const SEGREDO = 's'.repeat(32);
const AGORA = new Date('2026-11-24T12:00:00Z');
const AGORA_S = AGORA.getTime() / 1000;
const ID = '0b6c1f9e-3f0a-4c2e-9d55-8a1b2c3d4e5f';
const DIA = 24 * 60 * 60;
const INVALIDO = { ok: false, motivo: 'invalido' };

const params = (e: string | null, exp: number | string | null, sig: string | null) => ({ e, exp: exp === null ? null : String(exp), sig });

describe('links públicos das provas do dossiê (E28: sem login, 90 dias)', () => {
  it('prazo de 90 dias', () => {
    expect(DURACAO_LINK_PUBLICO_SEGUNDOS).toBe(90 * DIA);
  });

  it('aceita o link certo dentro do prazo', () => {
    const p = parametrosLinkPublico(SEGREDO, ID, AGORA);
    const exp = AGORA_S + 90 * DIA;
    expect(Object.fromEntries(p)).toEqual({ e: ID, exp: String(exp), sig: assinarLinkPublico(SEGREDO, ID, exp) });
    expect(verificarLinkPublico(SEGREDO, params(p.get('e'), p.get('exp'), p.get('sig')), AGORA)).toEqual({ ok: true, evidenciaId: ID, expiraEm: exp });
  });

  it('vale até o último segundo dos 90 dias; depois disso, "expirado"', () => {
    const p = parametrosLinkPublico(SEGREDO, ID, AGORA);
    const link = params(p.get('e'), p.get('exp'), p.get('sig'));
    const quase = new Date((AGORA_S + 90 * DIA - 1) * 1000);
    expect(verificarLinkPublico(SEGREDO, link, quase)).toMatchObject({ ok: true });
    expect(verificarLinkPublico(SEGREDO, link, new Date((AGORA_S + 90 * DIA) * 1000))).toEqual({ ok: false, motivo: 'expirado' });
    expect(verificarLinkPublico(SEGREDO, link, new Date((AGORA_S + 365 * DIA) * 1000))).toEqual({ ok: false, motivo: 'expirado' });
  });

  it('adulterado: id, prazo ou assinatura trocados, outro segredo ou parâmetro faltando', () => {
    const exp = AGORA_S + 90 * DIA;
    const sig = assinarLinkPublico(SEGREDO, ID, exp);
    const outroId = '0b6c1f9e-3f0a-4c2e-9d55-8a1b2c3d4e60';
    expect(verificarLinkPublico(SEGREDO, params(outroId, exp, sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, exp + 1, sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, exp, `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, exp, `${sig}A`), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico('t'.repeat(32), params(ID, exp, sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(null, exp, sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, null, sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, exp, null), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, '1e12', sig), AGORA)).toEqual(INVALIDO);
    expect(verificarLinkPublico(SEGREDO, params(ID, `${exp}.0`, sig), AGORA)).toEqual(INVALIDO);
    // Um id em maiúsculas é o mesmo UUID, mas não o texto assinado.
    expect(verificarLinkPublico(SEGREDO, params(ID.toUpperCase(), exp, sig), AGORA)).toEqual(INVALIDO);
  });

  it('caminho no lugar do id (travessia de pasta, chave do armazenamento): inválido, nem chega a conferir a assinatura', () => {
    const exp = AGORA_S + DIA;
    for (const e of ['../../etc/passwd', `evidencias/${ID}/${ID}.jpg`, `${ID}/../x`, `${ID}.mp4`, '..%2F..%2Fetc', '', ' ']) {
      // Mesmo assinado com o segredo certo, o que não é um UUID não abre.
      expect(verificarLinkPublico(SEGREDO, params(e, exp, assinarLinkPublico(SEGREDO, e, exp)), AGORA), e).toEqual(INVALIDO);
    }
  });

  it('prazo além dos 90 dias (de um link que este sistema nunca gera): inválido', () => {
    const exp = AGORA_S + 90 * DIA + 3600;
    expect(verificarLinkPublico(SEGREDO, params(ID, exp, assinarLinkPublico(SEGREDO, ID, exp)), AGORA)).toEqual(INVALIDO);
  });

  it('domínio separado dos links de sessão do /api/arquivos: um não abre o outro', () => {
    const exp = AGORA_S + 600;
    // Link de sessão (10 min) do mesmo texto: não vale como público.
    expect(verificarLinkPublico(SEGREDO, params(ID, exp, assinarLink(SEGREDO, ID, exp)), AGORA)).toEqual(INVALIDO);
    // Link público do mesmo texto: não vale como de sessão.
    expect(verificarLink(SEGREDO, { c: ID, exp: String(exp), sig: assinarLinkPublico(SEGREDO, ID, exp) }, AGORA)).toEqual(INVALIDO);
    expect(assinarLinkPublico(SEGREDO, ID, exp)).not.toBe(assinarLink(SEGREDO, ID, exp));
  });

  it('só assina id de evidência (UUID)', () => {
    expect(() => parametrosLinkPublico(SEGREDO, '../x', AGORA)).toThrow();
  });
});
