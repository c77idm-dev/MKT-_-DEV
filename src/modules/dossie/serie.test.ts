import { describe, expect, it } from 'vitest';
import { criarSerie } from './serie';

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('criarSerie (um dossiê por vez no servidor)', () => {
  it('roda um de cada vez, na ordem de chegada', async () => {
    const emSerie = criarSerie();
    const ordem: string[] = [];
    let rodando = 0;
    let maximo = 0;
    const tarefa = (nome: string, ms: number) => async () => {
      rodando += 1;
      maximo = Math.max(maximo, rodando);
      ordem.push(`início ${nome}`);
      await esperar(ms);
      ordem.push(`fim ${nome}`);
      rodando -= 1;
      return nome;
    };
    const resultados = await Promise.all([emSerie(tarefa('a', 30)), emSerie(tarefa('b', 5)), emSerie(tarefa('c', 1))]);
    expect(resultados).toEqual(['a', 'b', 'c']);
    expect(maximo).toBe(1);
    expect(ordem).toEqual(['início a', 'fim a', 'início b', 'fim b', 'início c', 'fim c']);
  });

  it('um erro não trava os próximos', async () => {
    const emSerie = criarSerie();
    const falha = emSerie(async () => {
      throw new Error('quebrou');
    });
    const depois = emSerie(async () => 'ok');
    await expect(falha).rejects.toThrow('quebrou');
    await expect(depois).resolves.toBe('ok');
  });
});
