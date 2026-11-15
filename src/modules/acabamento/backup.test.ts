import { describe, expect, it } from 'vitest';
import { vistaDoBackup } from './backup';

const agora = new Date('2026-11-20T12:00:00Z');
const base = { terminadoEm: null, tamanhoBanco: null, erro: null };

describe('vistaDoBackup (decisões 21 e 22)', () => {
  it('sem backup, OK e FALHOU', () => {
    expect(vistaDoBackup(null, agora)).toBeNull();
    expect(vistaDoBackup({ ...base, situacao: 'OK', iniciadoEm: new Date('2026-11-20T05:30:00Z'), tamanhoBanco: 126_248_141 }, agora)).toMatchObject({
      tom: 'bom',
      texto: expect.stringContaining('120,4 MB'),
    });
    expect(
      vistaDoBackup({ ...base, situacao: 'FALHOU', iniciadoEm: new Date('2026-11-20T05:30:00Z'), erro: 'BACKUP_SENHA não definida.' }, agora),
    ).toMatchObject({ tom: 'erro', erro: 'BACKUP_SENHA não definida.' });
  });
  it('em andamento há pouco é atenção; há mais de 6 h, interrompido', () => {
    expect(vistaDoBackup({ ...base, situacao: 'EM_ANDAMENTO', iniciadoEm: new Date('2026-11-20T11:00:00Z') }, agora)).toMatchObject({
      tom: 'atencao',
      texto: expect.stringMatching(/^Backup em andamento desde/),
    });
    expect(vistaDoBackup({ ...base, situacao: 'EM_ANDAMENTO', iniciadoEm: new Date('2026-11-20T05:00:00Z') }, agora)).toMatchObject({
      tom: 'erro',
      texto: expect.stringMatching(/^Backup interrompido/),
    });
  });
});
