// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { EvidenciaServidor } from './estadoSlot';
import type { RespostaAcao } from './tipos';

let enviosAtuais: RegistroEnvio[] = [];
const removerDaFila = vi.fn<(idCliente: string) => Promise<boolean>>(async () => true);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('./LeitorCodigo', () => ({ LeitorCodigo: () => null }));
vi.mock('@/components/midia/useFilaEnvios', () => ({
  useFilaEnvios: () => ({ envios: enviosAtuais, concluidos: [], adicionar: vi.fn(), tentarDeNovo: vi.fn(), descartar: vi.fn(), remover: removerDaFila }),
}));

import { AssistenteConferencia, type AcoesConferencia } from './AssistenteConferencia';

const item: ItemConferencia = {
  id: 'i1',
  unidade: 1,
  sku: 'SKU1',
  status: 'PENDENTE',
  descricao: 'Produto',
  eanEsperado: '789',
  serial: null,
  loteFabricacao: null,
  validade: null,
  eanLido: null,
  produtoRecebido: null,
  divergente: false,
  destino: null,
  motivo: null,
  observacao: null,
};

function envio(estado: RegistroEnvio['estado']): RegistroEnvio {
  return { idCliente: Math.random().toString(), estado, tipo: 'FOTO_1_ETIQUETA', itemId: null, arquivo: new Blob(['x']) } as RegistroEnvio;
}

function acoesDe(parcial: Partial<AcoesConferencia> = {}): AcoesConferencia {
  return {
    salvarItem: vi.fn(async () => ({ ok: true }) as RespostaAcao),
    registrarEan: vi.fn(async () => ({ ok: true, resultado: { situacao: 'confere', produtoRecebido: null, sugerirMotivo: null } }) as RespostaAcao<{ resultado: ResultadoEan }>),
    concluir: vi.fn(async () => ({ ok: true, destino: '/x' }) as RespostaAcao<{ destino: string }>),
    desistir: vi.fn(async () => ({ ok: true, destino: '/x' }) as RespostaAcao<{ destino: string }>),
    removerFotoAvaria: vi.fn(async () => ({ ok: true }) as const),
    ...parcial,
  };
}

function montar(acoes: AcoesConferencia, passoInicial = 0, evidencias: EvidenciaServidor[] = []) {
  return render(
    <AssistenteConferencia devolucao={{ id: 'd1', codigo: 'DEV-1', rastreio: null }} itens={[item]} evidencias={evidencias} videoObrigatorio="SO_PROBLEMA" passoInicial={passoInicial} acoes={acoes} />,
  );
}

beforeEach(() => {
  enviosAtuais = [];
  removerDaFila.mockClear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('AssistenteConferencia: desistir', () => {
  it('com arquivos ainda subindo, não desiste e pede para aguardar', async () => {
    enviosAtuais = [envio('pendente'), envio('enviando')];
    const acoes = acoesDe();
    montar(acoes);
    fireEvent.click(screen.getByRole('button', { name: 'Desistir da conferência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desistência' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Aguarde: 2 arquivo(s) ainda subindo. Desista depois que terminarem.');
    expect(acoes.desistir).not.toHaveBeenCalled();
  });

  it('enquanto desiste mostra "Desistindo…" e trava "Continuar conferindo"', async () => {
    let liberar!: (r: RespostaAcao<{ destino: string }>) => void;
    const acoes = acoesDe({ desistir: vi.fn(() => new Promise<RespostaAcao<{ destino: string }>>((ok) => (liberar = ok))) });
    montar(acoes);
    fireEvent.click(screen.getByRole('button', { name: 'Desistir da conferência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desistência' }));
    expect((await screen.findByRole('button', { name: 'Desistindo…' })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Continuar conferindo' }).hasAttribute('disabled')).toBe(true);
    await act(async () => liberar({ ok: true, destino: '/x' }));
  });
});

describe('AssistenteConferencia: concluir com envios que não subiram', () => {
  async function irParaDestinoEConcluir() {
    montar(acoesDe(), 3);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir conferência' }));
    return (await screen.findByRole('alert')).textContent ?? '';
  }

  it('só com erro: diz que não foram enviados e manda tocar em Tentar de novo', async () => {
    enviosAtuais = [envio('erro')];
    expect(await irParaDestinoEConcluir()).toContain('1 arquivo(s) não foram enviados: toque em Tentar de novo ou tire de novo.');
  });

  it('em espera ou enviando: mantém o "Aguarde"', async () => {
    enviosAtuais = [envio('pendente')];
    expect(await irParaDestinoEConcluir()).toContain('Aguarde: 1 arquivo ainda não subiu.');
  });
});

describe('AssistenteConferencia: o que foi digitado durante a leitura do EAN não é sobrescrito', () => {
  it('EAN divergente chega depois de digitar o S/N: o S/N continua na tela', async () => {
    let liberar!: (r: RespostaAcao<{ resultado: ResultadoEan }>) => void;
    const acoes = acoesDe({ registrarEan: vi.fn(() => new Promise<RespostaAcao<{ resultado: ResultadoEan }>>((ok) => (liberar = ok))) });
    montar(acoes, 1);
    fireEvent.change(screen.getByLabelText('EAN lido'), { target: { value: '111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
    fireEvent.change(screen.getByLabelText('Nº de série (S/N)'), { target: { value: 'ABC123' } });
    await act(async () => liberar({ ok: true, resultado: { situacao: 'diverge', produtoRecebido: null, sugerirMotivo: 'DIVERGENTE' } }));
    expect((screen.getByLabelText('Nº de série (S/N)') as HTMLInputElement).value).toBe('ABC123');
  });
});

describe('AssistenteConferencia: fotos da avaria (melhoria 2)', () => {
  const extra = (id: string): EvidenciaServidor => ({ id, tipo: 'EXTRA', itemId: 'i1', situacao: 'PRONTA', url: null, erro: null });

  it('no passo da unidade, remover a foto do servidor chama a ação e ela some da tela', async () => {
    const acoes = acoesDe();
    montar(acoes, 1, [extra('e1'), extra('e2')]);
    expect(screen.getByRole('heading', { name: 'Fotos da avaria (opcional)' })).toBeTruthy();
    const segunda = screen.getByRole('group', { name: 'Foto da avaria 2' });
    fireEvent.click(within(segunda).getByRole('button', { name: 'Remover' }));
    await act(async () => fireEvent.click(within(segunda).getByRole('button', { name: 'Confirmar remoção' })));
    expect(acoes.removerFotoAvaria).toHaveBeenCalledWith('e2');
    expect(screen.queryByRole('group', { name: 'Foto da avaria 2' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Foto da avaria 1' })).toBeTruthy();
  });

  it('a foto ainda subindo não é removida: pede para aguardar', async () => {
    removerDaFila.mockResolvedValueOnce(false);
    enviosAtuais = [{ ...envio('enviando'), idCliente: 'c1', tipo: 'EXTRA', itemId: 'i1', criadoEm: 1, progresso: 0.3 }];
    montar(acoesDe(), 1);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' })));
    expect(removerDaFila).toHaveBeenCalledWith('c1');
    expect(screen.getByRole('alert').textContent).toContain('Aguarde: a foto ainda está subindo. Remova quando terminar.');
  });

  it('sem internet, a remoção do servidor avisa e a foto continua', async () => {
    montar(acoesDe({ removerFotoAvaria: vi.fn(async () => { throw new Error('rede'); }) }), 1, [extra('e1')]);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' })));
    expect(screen.getByRole('alert').textContent).toContain('Sem conexão: a remoção precisa de internet.');
    expect(screen.getByRole('group', { name: 'Foto da avaria 1' })).toBeTruthy();
  });
});
