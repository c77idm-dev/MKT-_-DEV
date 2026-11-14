import { describe, expect, it, vi } from 'vitest';
import { notaTeste } from '../../../tests/helpers/nota-teste';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from './erros';
import { criarEmissorFocus, URL_FOCUS } from './focus';
import { NOME_HOMOLOGACAO } from './focus-mapeamento';

const TOKEN = 'TOKEN-SECRETO';
const BASIC = `Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`;
const REF = notaTeste().referencia;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function criar(respostas: (Response | Error)[], ambiente: 'HOMOLOGACAO' | 'PRODUCAO' = 'HOMOLOGACAO') {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error('o teste não preparou resposta');
    if (r instanceof Error) throw r;
    return r;
  });
  const emissor = criarEmissorFocus({ ambiente, token: TOKEN, fetchFn: fetchFn as unknown as typeof fetch, agora: () => new Date('2026-11-12T13:00:00Z') });
  return { emissor, chamadas };
}

describe('criarEmissorFocus', () => {
  it('emitir: POST /v2/nfe?ref= com Basic (token como usuário, senha vazia) e o payload da devolução', async () => {
    const { emissor, chamadas } = criar([json(202, { cnpj_emitente: '11444777000161', ref: REF, status: 'processando_autorizacao' })]);
    expect(await emissor.emitir(notaTeste())).toEqual({ referencia: REF });
    expect(chamadas[0].url).toBe(`${URL_FOCUS.HOMOLOGACAO}/v2/nfe?ref=${REF}`);
    expect(chamadas[0].init.method).toBe('POST');
    expect(chamadas[0].init.headers).toMatchObject({ authorization: BASIC, 'content-type': 'application/json' });
    expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({
      finalidade_emissao: 4,
      tipo_documento: 0,
      nome_destinatario: NOME_HOMOLOGACAO,
      data_emissao: '2026-11-12T10:00:00-03:00',
    });
  });

  it('201 (autorização síncrona) e 422 pending_operation / already_processed contam como enviado (mesmo ref)', async () => {
    const { emissor } = criar([
      json(201, { status: 'autorizado' }),
      json(422, { codigo: 'pending_operation', mensagem: 'Nota em processamento' }),
      json(422, { codigo: 'already_processed', mensagem: 'Nota já autorizada' }),
    ]);
    for (let i = 0; i < 3; i++) expect(await emissor.emitir(notaTeste())).toEqual({ referencia: REF });
  });

  it('422 erro_validacao_schema é recusa definitiva com os campos; o token nunca aparece na mensagem', async () => {
    const { emissor } = criar([
      json(422, { codigo: 'erro_validacao_schema', mensagem: 'Erro de validação', erros: [{ campo: 'cep_destinatario', mensagem: 'deve ter 8 digitos' }] }),
    ]);
    const erro = await emissor.emitir(notaTeste()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroEmissorRecusou);
    expect((erro as Error).message).toBe('Focus NFe recusou (erro_validacao_schema): Erro de validação cep_destinatario: deve ter 8 digitos');
    expect((erro as Error).message).not.toContain(TOKEN);
  });

  it('401 em HTML é token recusado; 429, 503 e falha de rede tentam de novo', async () => {
    const { emissor } = criar([
      new Response('HTTP Basic: Access denied.\n', { status: 401, headers: { 'content-type': 'text/html' } }),
      json(429, { codigo: 'limite' }),
      json(503, {}),
      new TypeError('fetch failed'),
    ]);
    const recusa = await emissor.emitir(notaTeste()).catch((e: unknown) => e);
    expect(recusa).toBeInstanceOf(ErroEmissorRecusou);
    expect((recusa as Error).message).not.toContain(TOKEN);
    await expect(emissor.emitir(notaTeste())).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    await expect(emissor.consultar(REF)).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    await expect(emissor.consultar(REF)).rejects.toThrow('A Focus NFe não respondeu (GET /v2/nfe/');
  });

  it('consultar: GET /v2/nfe/{ref}; 404 vira rejeição para reenviar', async () => {
    const { emissor, chamadas } = criar([json(200, { status: 'processando_autorizacao' }), json(404, { codigo: 'nao_encontrado' })]);
    expect(await emissor.consultar(REF)).toEqual({ situacao: 'PROCESSANDO' });
    expect(chamadas[0]).toMatchObject({ url: `${URL_FOCUS.HOMOLOGACAO}/v2/nfe/${REF}`, init: { method: 'GET' } });
    expect(await emissor.consultar(REF)).toEqual({
      situacao: 'REJEITADA',
      codigo: null,
      motivo: 'A nota não está na Focus NFe (o envio não chegou lá): use "Corrigir e reenviar".',
    });
  });

  it('cancelar: DELETE com a justificativa; erro_cancelamento e 422 nfe_nao_autorizada são recusas', async () => {
    const { emissor, chamadas } = criar([
      json(200, { status: 'cancelado', status_sefaz: '135', caminho_xml_cancelamento: '/arquivos/c.xml' }),
      json(200, { status: 'erro_cancelamento', mensagem_sefaz: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto' }),
      json(422, { codigo: 'nfe_nao_autorizada', mensagem: 'Nota fiscal não autorizada' }),
    ]);
    expect(await emissor.cancelar(REF, 'Cliente desistiu da devolução')).toEqual({ situacao: 'CANCELADA', urlXmlCancelamento: '/arquivos/c.xml' });
    expect(chamadas[0].init.method).toBe('DELETE');
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ justificativa: 'Cliente desistiu da devolução' });
    expect((await emissor.cancelar(REF, 'Cliente desistiu da devolução')).situacao).toBe('CANCELAMENTO_RECUSADO');
    expect(await emissor.cancelar(REF, 'Cliente desistiu da devolução')).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Focus NFe recusou (nfe_nao_autorizada): Nota fiscal não autorizada',
    });
  });

  it('baixar: caminho relativo no host do ambiente, com o Basic; endereço fora da Focus é recusado', async () => {
    const { emissor, chamadas } = criar([new Response('<nfeProc/>', { status: 200 })], 'PRODUCAO');
    expect((await emissor.baixar('/arquivos/x-nfe.xml')).toString('utf8')).toBe('<nfeProc/>');
    expect(chamadas[0].url).toBe('https://api.focusnfe.com.br/arquivos/x-nfe.xml');
    expect(chamadas[0].init.headers).toMatchObject({ authorization: BASIC });
    await expect(emissor.baixar('https://outro.exemplo.com/arquivos/x.xml')).rejects.toBeInstanceOf(ErroEmissorRecusou);
  });
});
