import { describe, expect, it } from 'vitest';
import { assinarLink, verificarLink } from './links';

const SEGREDO = 's'.repeat(32);
const AGORA = new Date('2026-11-12T12:00:00Z');
const EXP = AGORA.getTime() / 1000 + 600;
const CAMINHO = 'evidencias/d1/e1.jpg';

describe('links temporários do disco (spec §9: 10 min, nunca público)', () => {
  it('aceita o link certo dentro do prazo', () => {
    const sig = assinarLink(SEGREDO, CAMINHO, EXP);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP), sig }, AGORA)).toEqual({ ok: true, caminho: CAMINHO, expiraEm: EXP });
  });

  it('recusa assinatura errada, caminho trocado, outro segredo ou parâmetro faltando', () => {
    const sig = assinarLink(SEGREDO, CAMINHO, EXP);
    const invalido = { ok: false, motivo: 'invalido' };
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP), sig: 'x' + sig.slice(1) }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: 'evidencias/d1/outro.jpg', exp: String(EXP), sig }, AGORA)).toEqual(invalido);
    expect(verificarLink('t'.repeat(32), { c: CAMINHO, exp: String(EXP), sig }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: null, sig }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP + 1), sig }, AGORA)).toEqual(invalido);
  });

  it('recusa o link vencido como "expirado"', () => {
    const exp = AGORA.getTime() / 1000 - 1;
    const sig = assinarLink(SEGREDO, CAMINHO, exp);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(exp), sig }, AGORA)).toEqual({ ok: false, motivo: 'expirado' });
  });
});
