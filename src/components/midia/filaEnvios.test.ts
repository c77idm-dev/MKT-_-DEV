import { describe, expect, it } from 'vitest';
import { ArmazemMemoria, FilaEnvios, proximaEspera, type NovoEnvio, type ResultadoTransporte, type Transporte } from './filaEnvios';

function novo(idCliente: string): NovoEnvio {
  return { idCliente, devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', nome: 'foto.jpg', tipoConteudo: 'image/jpeg', arquivo: new Blob(['abc']) };
}

/** Responde na ordem da lista (depois, sucesso) e anota cada chamada. */
function transporteDe(respostas: (ResultadoTransporte | Error)[]) {
  const chamadas: { idCliente: string; uploadUrl: string | null }[] = [];
  const transporte: Transporte = async (r, eventos) => {
    chamadas.push({ idCliente: r.idCliente, uploadUrl: r.uploadUrl });
    eventos.aoUrl(`/api/midia/${r.idCliente}`);
    eventos.aoProgresso(1);
    const resposta = respostas.shift() ?? { ok: true, evidenciaId: `ev-${r.idCliente}` };
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { transporte, chamadas };
}

describe('FilaEnvios (spec §9: os arquivos pendentes ficam no aparelho)', () => {
  it('guarda antes de enviar e só tira depois que o servidor confirma', async () => {
    let liberar!: (r: ResultadoTransporte) => void;
    const armazem = new ArmazemMemoria();
    const fila = new FilaEnvios(armazem, () => new Promise<ResultadoTransporte>((ok) => (liberar = ok)));
    const concluidos: string[] = [];
    fila.aoConcluir((e) => concluidos.push(e.evidenciaId));
    await fila.adicionar(novo('a'));
    await expect.poll(async () => (await armazem.listar()).map((r) => r.estado)).toEqual(['enviando']);
    liberar({ ok: true, evidenciaId: 'ev-a' });
    await fila.processar();
    expect(await armazem.listar()).toEqual([]);
    expect(concluidos).toEqual(['ev-a']);
  });

  it('falha de rede: fica pendente, espera e continua o mesmo upload', async () => {
    let agora = 1_000_000;
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: false, mensagem: 'Sem conexão' }]);
    const fila = new FilaEnvios(armazem, transporte, () => agora, () => 0.5);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({
      estado: 'pendente',
      tentativas: 1,
      mensagem: 'Sem conexão',
      uploadUrl: '/api/midia/a',
      proximaTentativaEm: agora + 2000,
    });
    await fila.processar();
    expect(chamadas).toHaveLength(1); // antes da hora, não tenta
    agora += 2000;
    await fila.processar();
    expect(chamadas).toEqual([
      { idCliente: 'a', uploadUrl: null },
      { idCliente: 'a', uploadUrl: '/api/midia/a' },
    ]);
    expect(await armazem.listar()).toEqual([]);
  });

  it('a volta da rede (forçar) tenta na hora, mesmo antes do prazo', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([new Error('Failed to fetch')]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({ estado: 'pendente', mensagem: 'Sem conexão com o servidor. Tentando de novo…' });
    await fila.processar(true);
    expect(chamadas).toHaveLength(2);
    expect(await armazem.listar()).toEqual([]);
  });

  it('recusa definitiva: fica com erro e não tenta sozinha; "Tentar de novo" envia', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: true, mensagem: 'Foto grande demais (máximo 15 MB).' }]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({ estado: 'erro', mensagem: 'Foto grande demais (máximo 15 MB).' });
    await fila.processar(true);
    expect(chamadas).toHaveLength(1);
    await fila.tentarDeNovo('a');
    expect(chamadas).toHaveLength(2);
    expect(await armazem.listar()).toEqual([]);
  });

  it('chamadas ao mesmo tempo não enviam duas vezes; descartar tira da fila', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: true, mensagem: 'x' }]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await Promise.all([fila.processar(true), fila.processar(true), fila.processar()]);
    expect(chamadas).toHaveLength(1);
    await fila.descartar('a');
    expect(await armazem.listar()).toEqual([]);
  });
});

describe('proximaEspera (espera crescente com sorteio, até 5 min)', () => {
  it('2 s, 4 s, 8 s... com ±20%', () => {
    expect(proximaEspera(1, 0.5)).toBe(2000);
    expect(proximaEspera(2, 0.5)).toBe(4000);
    expect(proximaEspera(1, 0)).toBe(1600);
    expect(proximaEspera(1, 1)).toBe(2400);
    expect(proximaEspera(30, 0.5)).toBe(300_000);
  });
});
