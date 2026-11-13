import { describe, expect, it } from 'vitest';
import { CONFIG_TAREFAS, FUSO_AGENDAS, NOMES_TAREFAS, TAREFAS_NA_SUBIDA } from './tarefas';

describe('tarefas de fundo (contrato §5.1)', () => {
  it('as 12 tarefas do contrato, todas com 5 tentativas (spec §11)', () => {
    expect([...NOMES_TAREFAS].sort()).toEqual(
      [
        'midia.processar-foto',
        'midia.transcodificar',
        'limpeza.temporarios',
        'ml.sincronizar-reclamacao',
        'ml.varredura',
        'ml.renovar-token',
        'ml.enviar-resultado',
        'ml.enviar-contestacao',
        'nfe.emitir',
        'nfe.consultar',
        'lotes.alocar-pendentes',
        'midia.retencao',
      ].sort(),
    );
    for (const nome of NOMES_TAREFAS) expect(CONFIG_TAREFAS[nome].tentativas, nome).toBe(5);
  });

  it('a transcodificação pode levar 1 hora; as outras, 5 minutos', () => {
    for (const nome of NOMES_TAREFAS) {
      expect(CONFIG_TAREFAS[nome].expiraEmSegundos, nome).toBe(nome === 'midia.transcodificar' ? 3600 : 300);
    }
  });

  it('agendas no horário de São Paulo', () => {
    expect(FUSO_AGENDAS).toBe('America/Sao_Paulo');
    const agendas = Object.fromEntries(NOMES_TAREFAS.filter((n) => CONFIG_TAREFAS[n].agenda).map((n) => [n, CONFIG_TAREFAS[n].agenda]));
    expect(agendas).toEqual({
      'limpeza.temporarios': '30 3 * * *',
      'ml.varredura': '*/15 * * * *',
      'ml.renovar-token': '0 */5 * * *',
      'midia.retencao': '0 3 * * *',
    });
  });

  it('lotes.alocar-pendentes roda uma vez, na subida do worker', () => {
    expect(TAREFAS_NA_SUBIDA).toEqual(['lotes.alocar-pendentes']);
  });
});
