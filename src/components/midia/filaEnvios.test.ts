import { describe, expect, it } from 'vitest';
import { ArmazemMemoria, FilaEnvios, juntarConcluido, proximaEspera, type NovoEnvio, type ResultadoTransporte, type Transporte } from './filaEnvios';

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

describe('FilaEnvios: refazer a mesma vaga descarta o envio antigo', () => {
  it('o antigo em erro some quando o operador refaz; fica só o novo', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: true, mensagem: 'Conferência de outra pessoa.' }]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('velho'));
    await fila.processar();
    expect((await armazem.listar()).map((r) => [r.idCliente, r.estado])).toEqual([['velho', 'erro']]);
    await fila.adicionar(novo('novo'));
    await fila.processar();
    expect(chamadas.map((c) => c.idCliente)).toEqual(['velho', 'novo']);
    expect(await armazem.listar()).toEqual([]);
    expect((await fila.listar()).length).toBe(0);
  });

  it('o antigo em espera nunca sobe depois do novo', async () => {
    let agora = 1_000_000;
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: false, mensagem: 'Sem conexão' }]);
    const fila = new FilaEnvios(armazem, transporte, () => agora, () => 0.5);
    await fila.adicionar(novo('velho'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({ idCliente: 'velho', estado: 'pendente' });
    agora += 10;
    await fila.adicionar(novo('novo'));
    await fila.processar();
    agora += 60_000;
    await fila.processar(true);
    expect(chamadas.map((c) => c.idCliente)).toEqual(['velho', 'novo']);
    expect(await armazem.listar()).toEqual([]);
  });

  it('vagas diferentes e fotos EXTRA não se descartam', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte } = transporteDe([
      { ok: false, definitivo: true, mensagem: 'x' },
      { ok: false, definitivo: true, mensagem: 'x' },
    ]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar({ ...novo('e1'), tipo: 'EXTRA' });
    await fila.processar();
    await fila.adicionar({ ...novo('e2'), tipo: 'EXTRA' });
    await fila.processar();
    await fila.adicionar({ ...novo('f2'), tipo: 'FOTO_2_EMBALAGEM' });
    expect((await armazem.listar()).map((r) => r.idCliente).sort()).toEqual(['e1', 'e2', 'f2']);
  });

  it('o antigo que estava enviando e falha não é regravado quando já há um mais novo', async () => {
    let liberar!: (r: ResultadoTransporte) => void;
    const armazem = new ArmazemMemoria();
    let n = 0;
    const fila = new FilaEnvios(armazem, async () => (++n === 1 ? new Promise<ResultadoTransporte>((ok) => (liberar = ok)) : { ok: false, definitivo: true, mensagem: 'x' }));
    await fila.adicionar(novo('velho'));
    await expect.poll(async () => (await armazem.listar()).map((r) => r.estado)).toEqual(['enviando']);
    await fila.adicionar(novo('novo'));
    liberar({ ok: false, definitivo: false, mensagem: 'Sem conexão' });
    await fila.processar();
    expect((await armazem.listar()).map((r) => r.idCliente)).toEqual(['novo']);
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

describe('remover (melhoria 2: fotos da avaria)', () => {
  const extra = (idCliente: string): NovoEnvio => ({ ...novo(idCliente), itemId: 'i1', tipo: 'EXTRA' });

  it('remover tira da fila e o envio nunca acontece', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: false, mensagem: 'Sem conexão' }]);
    let agora = 1_000_000;
    const fila = new FilaEnvios(armazem, transporte, () => agora, () => 0.5);
    await fila.adicionar(extra('a'));
    await fila.processar();
    expect(chamadas).toHaveLength(1);
    expect(await fila.remover('a')).toBe('removida');
    agora += 60_000;
    await fila.processar(true);
    expect(chamadas).toHaveLength(1);
    expect(await armazem.listar()).toEqual([]);
  });

  it('remover durante o envio devolve "subindo" e o envio termina normalmente', async () => {
    let liberar!: (r: ResultadoTransporte) => void;
    const armazem = new ArmazemMemoria();
    const fila = new FilaEnvios(armazem, () => new Promise<ResultadoTransporte>((ok) => (liberar = ok)));
    const concluidos: string[] = [];
    fila.aoConcluir((e) => concluidos.push(e.evidenciaId));
    await fila.adicionar(extra('a'));
    await expect.poll(async () => (await armazem.listar()).map((r) => r.estado)).toEqual(['enviando']);
    expect(await fila.remover('a')).toBe('subindo');
    liberar({ ok: true, evidenciaId: 'ev-a' });
    await fila.processar();
    expect(concluidos).toEqual(['ev-a']);
    expect(await armazem.listar()).toEqual([]);
  });

  it('remover depois de a rodada escolher o envio: ele é pulado', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([]);
    const fila = new FilaEnvios(armazem, transporte);
    // A rodada lê a lista (assíncrono) e só depois começa o envio: a remoção cai nesse intervalo.
    const listarOriginal = armazem.listar.bind(armazem);
    let removerNaLeitura = false;
    armazem.listar = async () => {
      const lista = await listarOriginal();
      if (removerNaLeitura) {
        removerNaLeitura = false;
        await fila.remover('a');
      }
      return lista;
    };
    await armazem.gravar({ ...extra('a'), tamanho: 3, criadoEm: 1, tentativas: 0, proximaTentativaEm: 0, estado: 'pendente', uploadUrl: null, mensagem: null, progresso: 0 });
    removerNaLeitura = true;
    await fila.processar();
    expect(chamadas).toEqual([]);
    expect(await listarOriginal()).toEqual([]);
  });

  it('remover depois de a foto já ter subido: avisa "ja_enviada" (a tela pede para remover do servidor)', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte } = transporteDe([]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(extra('a'));
    await fila.processar();
    expect(await armazem.listar()).toEqual([]);
    expect(await fila.remover('a')).toBe('ja_enviada');
  });

  it('juntarConcluido guarda duas EXTRA da mesma unidade e substitui a Foto 3', () => {
    const base = { devolucaoId: 'd1', itemId: 'i1' };
    let lista = juntarConcluido([], { ...base, idCliente: 'a', tipo: 'EXTRA', evidenciaId: 'e1' });
    lista = juntarConcluido(lista, { ...base, idCliente: 'b', tipo: 'EXTRA', evidenciaId: 'e2' });
    lista = juntarConcluido(lista, { ...base, idCliente: 'c', tipo: 'FOTO_3_PRODUTO', evidenciaId: 'e3' });
    lista = juntarConcluido(lista, { ...base, idCliente: 'd', tipo: 'FOTO_3_PRODUTO', evidenciaId: 'e4' });
    lista = juntarConcluido(lista, { ...base, idCliente: 'a', tipo: 'EXTRA', evidenciaId: 'e1' });
    expect(lista.map((x) => x.evidenciaId)).toEqual(['e2', 'e4', 'e1']);
  });
});
