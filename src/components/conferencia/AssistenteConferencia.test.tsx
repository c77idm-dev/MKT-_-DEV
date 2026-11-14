// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { RespostaAcao } from './tipos';

let enviosAtuais: RegistroEnvio[] = [];
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('./LeitorCodigo', () => ({ LeitorCodigo: () => null }));
vi.mock('@/components/midia/useFilaEnvios', () => ({
  useFilaEnvios: () => ({ envios: enviosAtuais, concluidos: [], adicionar: vi.fn(), tentarDeNovo: vi.fn(), descartar: vi.fn() }),
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
    ...parcial,
  };
}

function montar(acoes: AcoesConferencia, passoInicial = 0) {
  return render(
    <AssistenteConferencia devolucao={{ id: 'd1', codigo: 'DEV-1', rastreio: null }} itens={[item]} evidencias={[]} videoObrigatorio="SO_PROBLEMA" passoInicial={passoInicial} acoes={acoes} />,
  );
}

beforeEach(() => {
  enviosAtuais = [];
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
