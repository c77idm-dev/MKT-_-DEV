import { describe, expect, it } from 'vitest';
import { NOMES_TAREFAS } from '@/modules/fila/tarefas';
import { ehNomeTarefa, ROTULO_SITUACAO_FALHA, ROTULO_TAREFA } from './dominio';

describe('vocabulário do acabamento', () => {
  it('toda tarefa do contrato tem um nome em português para a tela Falhas', () => {
    for (const nome of NOMES_TAREFAS) expect(ROTULO_TAREFA[nome]).toMatch(/\S/);
    expect(ROTULO_TAREFA['midia.transcodificar']).toBe('Comprimir o Vídeo de Prova');
    expect(ROTULO_TAREFA['nfe.emitir']).toBe('Emitir NF-e');
    expect(ROTULO_TAREFA['midia.retencao']).toBe('Prazo de guarda das mídias');
  });

  it('situações da falha', () => {
    expect(Object.values(ROTULO_SITUACAO_FALHA)).toEqual(['Aberta', 'Reenviada', 'Dispensada']);
  });

  it('só as tarefas do contrato são reconhecidas (a fila "falhas" não é uma tarefa)', () => {
    expect(ehNomeTarefa('nfe.emitir')).toBe(true);
    expect(ehNomeTarefa('falhas')).toBe(false);
    expect(ehNomeTarefa('')).toBe(false);
  });
});
