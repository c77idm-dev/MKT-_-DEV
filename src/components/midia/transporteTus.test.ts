import { describe, expect, it, vi } from 'vitest';
import { criarTransporteTus, idDoEnvio, resultadoDoErro } from './transporteTus';

const falso = vi.hoisted(() => ({ opcoes: null as null | { onSuccess: () => Promise<void> }, url: '' }));
vi.mock('tus-js-client', () => ({
  Upload: class {
    constructor(_arquivo: unknown, opcoes: { onSuccess: () => Promise<void> }) {
      falso.opcoes = opcoes;
    }
    get url() {
      return falso.url;
    }
    start() {
      void falso.opcoes?.onSuccess();
    }
  },
}));

describe('transporte tus', () => {
  it('o id do upload é o último pedaço da URL', () => {
    expect(idDoEnvio('/api/midia/0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(idDoEnvio('https://x.com/api/midia/abc?y=1')).toBe('abc');
  });

  it('rede, 5xx, 423 e 429 são passageiros; 401 pede login; o resto mostra a mensagem do servidor', () => {
    for (const status of [null, 0, 500, 503, 423, 429]) expect(resultadoDoErro(status, '')).toMatchObject({ ok: false, definitivo: false });
    expect(resultadoDoErro(401, '')).toEqual({ ok: false, definitivo: true, mensagem: 'Sua sessão terminou. Entre no sistema de novo e toque em "Tentar de novo".' });
    expect(resultadoDoErro(413, 'Foto grande demais (máximo 15 MB).\n')).toEqual({ ok: false, definitivo: true, mensagem: 'Foto grande demais (máximo 15 MB).' });
    expect(resultadoDoErro(400, '')).toEqual({ ok: false, definitivo: true, mensagem: 'O servidor recusou o arquivo (erro 400).' });
  });

  it('ao terminar o envio, registra a evidência passando o idCliente (idempotência do servidor)', async () => {
    falso.url = '/api/midia/abc123?x=1';
    const registrar = vi.fn().mockResolvedValue({ ok: true, evidenciaId: 'ev1' });
    const transporte = criarTransporteTus(registrar);
    const r = { idCliente: 'cli-1', devolucaoId: 'd1', tipo: 'foto1', tipoConteudo: 'image/jpeg', nome: 'a.jpg', arquivo: new Blob(['x']) };
    const res = await transporte(r as never, { aoUrl: () => {}, aoProgresso: () => {} } as never);
    expect(registrar).toHaveBeenCalledWith('abc123', 'cli-1');
    expect(res).toEqual({ ok: true, evidenciaId: 'ev1' });
  });
});
