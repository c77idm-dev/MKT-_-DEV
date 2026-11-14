import { describe, expect, it } from 'vitest';
import { mensagemDoErro } from './log';

describe('mensagemDoErro (decisão 6)', () => {
  it('só a message do erro que o pg-boss guardou, sem a pilha', () => {
    expect(mensagemDoErro({ name: 'Error', message: 'Focus fora do ar', stack: 'Error: Focus fora do ar\n    at x (y.ts:1)' })).toBe('Focus fora do ar');
  });
  it('o tempo esgotado do pg-boss vira "Tempo esgotado"', () => {
    expect(mensagemDoErro({ value: { message: 'job timed out' } })).toBe('Tempo esgotado');
    expect(mensagemDoErro({ value: { message: 'outra coisa' } })).toBe('outra coisa');
    expect(mensagemDoErro({ name: 'Error', message: 'handler execution exceeded 300s' })).toBe('Tempo esgotado');
  });
  it('texto simples, vazio e outros formatos', () => {
    expect(mensagemDoErro('tempo esgotado')).toBe('tempo esgotado');
    expect(mensagemDoErro(null)).toBe('Sem detalhes do erro.');
    expect(mensagemDoErro({ value: 'x' })).toBe('{"value":"x"}');
  });
  it('corta em 500 caracteres e tira caracteres de controle', () => {
    const longa = mensagemDoErro({ message: 'a'.repeat(600) });
    expect(longa).toHaveLength(500);
    expect(longa.endsWith('…')).toBe(true);
    expect(mensagemDoErro({ message: 'linha 1\nlinha 2\u0000' })).toBe('linha 1 linha 2');
  });
});

import { linhaErroRequisicao } from './log';

const req = { path: '/fluxo/busca?rastreio=BR123&pedido=9', method: 'GET', headers: { cookie: 'sessao=segredo' } };
const ctx = { routePath: '/fluxo/busca', routeType: 'render' };

describe('linhaErroRequisicao (spec §11; decisão 18)', () => {
  it('uma linha JSON com caminho sem query, método, rota, tipo, mensagem e digest', () => {
    const erro = Object.assign(new Error('falhou ao ler'), { digest: '123' });
    expect(JSON.parse(linhaErroRequisicao(erro, req, ctx, new Date('2026-11-20T10:00:00Z')))).toEqual({
      em: '2026-11-20T10:00:00.000Z', nivel: 'erro', origem: 'web', caminho: '/fluxo/busca', metodo: 'GET',
      rota: '/fluxo/busca', tipo: 'render', mensagem: 'falhou ao ler', digest: '123',
    });
  });
  it('nunca leva cabeçalhos, query nem pilha; mensagem até 500 caracteres', () => {
    const linha = linhaErroRequisicao(new Error('x'.repeat(900)), req, ctx, new Date());
    expect(linha).not.toContain('segredo');
    expect(linha).not.toContain('BR123');
    expect(linha).not.toContain('at ');
    expect(JSON.parse(linha).mensagem).toHaveLength(500);
    expect(linha).not.toMatch(/\n/);
  });
});
