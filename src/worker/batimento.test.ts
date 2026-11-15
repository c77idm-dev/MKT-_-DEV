import { mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { batimentoRecente, iniciarBatimento, LIMITE_BATIMENTO_MS } from './batimento';

const pasta = () => mkdtempSync(join(tmpdir(), 'batimento-'));

describe('batimento do worker (healthcheck; decisão 17)', () => {
  it('grava logo e depois a cada intervalo; para quando pedido', async () => {
    const arquivo = join(pasta(), 'vivo');
    const parar = iniciarBatimento(arquivo, 50);
    try {
      expect(batimentoRecente(arquivo, Date.now())).toBe(true);
      const primeira = statSync(arquivo).mtimeMs;
      await expect.poll(() => statSync(arquivo).mtimeMs, { timeout: 3000, interval: 25 }).toBeGreaterThan(primeira);
    } finally {
      parar();
    }
  });

  it('sem arquivo ou com batimento velho: não está vivo', () => {
    const arquivo = join(pasta(), 'vivo');
    expect(batimentoRecente(arquivo, Date.now())).toBe(false);
    writeFileSync(arquivo, '');
    const velho = (Date.now() - LIMITE_BATIMENTO_MS - 5000) / 1000;
    utimesSync(arquivo, velho, velho);
    expect(batimentoRecente(arquivo, Date.now())).toBe(false);
  });
});
