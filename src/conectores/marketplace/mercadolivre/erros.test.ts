import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARCA_REDIGIDO } from '@/lib/redigir';
import { ErroML } from './cliente';
import { codigoErroML, ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML, mensagemErroML, resumirCorpoErro } from './erros';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resumirCorpoErro (movido de scripts/ml/selecao.ts)', () => {
  it('redige dados pessoais de um corpo JSON e mantém os demais campos', () => {
    const obtido = JSON.parse(resumirCorpoErro(JSON.stringify({ message: 'not_found', buyer: { first_name: 'Ana' } })));
    expect(obtido.buyer.first_name).toBe(MARCA_REDIGIDO);
    expect(obtido.message).toBe('not_found');
  });

  it('omite um corpo que não é JSON, sem repetir o conteúdo', () => {
    const resumo = resumirCorpoErro('<html>erro Ana Souza</html>');
    expect(resumo).toBe('[corpo não-JSON omitido: 27 caracteres]');
    expect(resumo).not.toContain('Ana');
  });

  it('corta o resumo em no máximo 300 caracteres', () => {
    expect(resumirCorpoErro(JSON.stringify({ message: 'x'.repeat(1000) })).length).toBeLessThanOrEqual(300);
  });
});

describe('codigoErroML e mensagemErroML', () => {
  it('lê o código em "error" ou "code" e acha invalid_operator_user_id em qualquer parte', () => {
    expect(codigoErroML(new ErroML(400, '{"error":"invalid_grant","message":"x"}', '/oauth/token'))).toBe('invalid_grant');
    expect(codigoErroML(new ErroML(429, '{"code":"local_rate_limited"}', '/x'))).toBe('local_rate_limited');
    expect(codigoErroML(new ErroML(403, '{"message":"invalid_operator_user_id: use a conta principal"}', '/oauth/token'))).toBe(
      'invalid_operator_user_id',
    );
    expect(codigoErroML(new ErroML(500, '<html>', '/x'))).toBeNull();
    expect(codigoErroML(new Error('outro'))).toBeNull();
  });

  it('mensagem curta para o Gestor, com o HTTP', () => {
    expect(mensagemErroML(new ErroML(400, '{"message":"The return review is not available","error":"bad_request"}', '/x'))).toBe(
      'The return review is not available (HTTP 400)',
    );
    expect(mensagemErroML(new ErroML(404, '', '/x'))).toBe('sem detalhes (HTTP 404)');
  });
});

describe('ehRecusaDefinitiva', () => {
  it('400, 403, 404, 409 e 422 não melhoram tentando de novo; 401, 429, 5xx e outros erros sim', () => {
    for (const status of [400, 403, 404, 409, 422]) expect(ehRecusaDefinitiva(new ErroML(status, '', '/x'))).toBe(true);
    for (const status of [401, 429, 500, 503]) expect(ehRecusaDefinitiva(new ErroML(status, '', '/x'))).toBe(false);
    expect(ehRecusaDefinitiva(new Error('rede'))).toBe(false);
  });
});

describe('logErroML (LGPD: o corpo passa por resumirCorpoErro)', () => {
  it('escreve JSON numa linha, sem o nome do comprador', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    logErroML('sincronizar', new ErroML(404, JSON.stringify({ buyer: { first_name: 'Ana' } }), '/orders/1'), { reclamacaoId: '5' });
    const linha = String(espiao.mock.calls[0][0]);
    expect(JSON.parse(linha)).toMatchObject({
      nivel: 'erro',
      origem: 'mercado-livre',
      contexto: 'sincronizar',
      status: 404,
      caminho: '/orders/1',
      reclamacaoId: '5',
    });
    expect(linha).not.toContain('Ana');
  });
});

describe('ErroMotivoIndisponivel', () => {
  it('diz o motivo recusado e os aceitos', () => {
    expect(new ErroMotivoIndisponivel('SRF5', ['SRF2', 'SRF6']).message).toBe(
      'O Mercado Livre não aceita o motivo SRF5 nesta devolução. Motivos aceitos: SRF2, SRF6.',
    );
  });
});
