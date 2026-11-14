import { describe, expect, it } from 'vitest';
import { CHAVE_VENDA_TESTE, DESTINATARIO_TESTE, notaTeste } from '../../../tests/helpers/nota-teste';
import { ErroEmissorIndisponivel } from './erros';
import { dataFocus, interpretarCancelamentoFocus, interpretarConsultaFocus, montarPayloadFocus, NOME_HOMOLOGACAO } from './focus-mapeamento';

const EMITIDA = new Date('2026-11-12T13:00:00Z');

describe('montarPayloadFocus (pesquisa focus-nfe.md §2.2)', () => {
  it('devolução de venda no Simples, comprador pessoa física, em homologação', () => {
    expect(montarPayloadFocus(notaTeste(), { ambiente: 'HOMOLOGACAO', emitidaEm: EMITIDA })).toEqual({
      natureza_operacao: 'Devolucao de venda',
      data_emissao: '2026-11-12T10:00:00-03:00',
      data_entrada_saida: '2026-11-12T10:00:00-03:00',
      tipo_documento: 0,
      finalidade_emissao: 4,
      local_destino: 1,
      consumidor_final: 1,
      presenca_comprador: 0,
      modalidade_frete: 9,
      regime_tributario_emitente: 1,
      cnpj_emitente: '11444777000161',
      inscricao_estadual_emitente: '110042490114',
      nome_emitente: 'Empresa Teste Ltda',
      logradouro_emitente: 'Rua A',
      numero_emitente: '100',
      bairro_emitente: 'Centro',
      municipio_emitente: 'Sao Paulo',
      uf_emitente: 'SP',
      cep_emitente: '01001000',
      nome_destinatario: NOME_HOMOLOGACAO,
      cpf_destinatario: '52998224725',
      indicador_inscricao_estadual_destinatario: 9,
      logradouro_destinatario: 'Rua B',
      numero_destinatario: '50',
      bairro_destinatario: 'Jardim',
      municipio_destinatario: 'Sao Paulo',
      uf_destinatario: 'SP',
      cep_destinatario: '01002000',
      notas_referenciadas: [{ chave_nfe: CHAVE_VENDA_TESTE }],
      informacoes_adicionais_contribuinte: `Devolucao referente a NF-e ${CHAVE_VENDA_TESTE}. Devolucao DEV-000001.`,
      valor_produtos: 199.9,
      valor_total: 199.9,
      items: [
        {
          numero_item: 1,
          codigo_produto: 'FONE-01',
          descricao: 'Fone Bluetooth',
          codigo_ncm: '85183000',
          cfop: '1202',
          unidade_comercial: 'UN',
          quantidade_comercial: 2,
          valor_unitario_comercial: 99.95,
          unidade_tributavel: 'UN',
          quantidade_tributavel: 2,
          valor_unitario_tributavel: 99.95,
          valor_bruto: 199.9,
          codigo_barras_comercial: '7891234567895',
          codigo_barras_tributavel: '7891234567895',
          inclui_no_total: 1,
          icms_origem: 0,
          icms_situacao_tributaria: '900',
          pis_situacao_tributaria: '98',
          cofins_situacao_tributaria: '98',
        },
      ],
    });
  });

  it('Lucro Presumido, comprador contribuinte (CNPJ e IE), em produção: tributos e nome reais', () => {
    const nota = notaTeste({
      regime: 'PRESUMIDO',
      consumidorFinal: false,
      operacao: 'FORA_ESTADO',
      destinatario: { ...DESTINATARIO_TESTE, nome: 'Loja Exemplo Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1, uf: 'RJ' },
      itens: [
        {
          ...notaTeste().itens[0],
          cfop: '2202',
          icmsSituacao: '00',
          pisSituacao: '01',
          cofinsSituacao: '01',
          tributos: { icmsBase: 199.9, icmsAliquota: 18, icmsValor: 35.98, pisBase: 199.9, pisAliquota: 0.65, pisValor: 1.3, cofinsBase: 199.9, cofinsAliquota: 3, cofinsValor: 6 },
        },
      ],
    });
    const payload = montarPayloadFocus(nota, { ambiente: 'PRODUCAO', emitidaEm: EMITIDA });
    expect(payload).toMatchObject({
      local_destino: 2,
      consumidor_final: 0,
      regime_tributario_emitente: 3,
      nome_destinatario: 'Loja Exemplo Ltda',
      cnpj_destinatario: '19131243000197',
      inscricao_estadual_destinatario: '123456789',
      indicador_inscricao_estadual_destinatario: 1,
    });
    expect(payload).not.toHaveProperty('cpf_destinatario');
    expect((payload.items as Record<string, unknown>[])[0]).toMatchObject({
      icms_situacao_tributaria: '00',
      icms_modalidade_base_calculo: 3,
      icms_base_calculo: 199.9,
      icms_aliquota: 18,
      icms_valor: 35.98,
      pis_base_calculo: 199.9,
      pis_aliquota_porcentual: 0.65,
      pis_valor: 1.3,
      cofins_base_calculo: 199.9,
      cofins_aliquota_porcentual: 3,
      cofins_valor: 6,
    });
  });

  it('remessa (saída normal) sem nota referenciada; sem EAN vai "SEM GTIN"', () => {
    const nota = notaTeste({
      tipo: 'REMESSA_CONSERTO',
      entrada: false,
      finalidade: 'NORMAL',
      operacao: 'FORA_ESTADO',
      consumidorFinal: false,
      chavesReferenciadas: [],
      itens: [{ ...notaTeste().itens[0], ean: null, cfop: '6915' }],
    });
    const payload = montarPayloadFocus(nota, { ambiente: 'HOMOLOGACAO', emitidaEm: EMITIDA });
    expect(payload).toMatchObject({ tipo_documento: 1, finalidade_emissao: 1, local_destino: 2, consumidor_final: 0 });
    expect(payload).not.toHaveProperty('notas_referenciadas');
    expect((payload.items as Record<string, unknown>[])[0]).toMatchObject({ codigo_barras_comercial: 'SEM GTIN', cfop: '6915' });
  });

  it('data no horário de Brasília', () => {
    expect(dataFocus(new Date('2026-11-13T02:30:00Z'))).toBe('2026-11-12T23:30:00-03:00');
  });
});

describe('respostas da Focus', () => {
  it('consulta: processando, autorizada (sem o prefixo NFe), rejeitada, denegada e cancelada', () => {
    expect(interpretarConsultaFocus({ status: 'processando_autorizacao' })).toEqual({ situacao: 'PROCESSANDO' });
    expect(
      interpretarConsultaFocus({
        status: 'autorizado',
        status_sefaz: '100',
        chave_nfe: `NFe${CHAVE_VENDA_TESTE}`,
        numero: '123',
        serie: '1',
        caminho_xml_nota_fiscal: '/arquivos/x-nfe.xml',
        caminho_danfe: '/arquivos/x.pdf',
      }),
    ).toEqual({ situacao: 'AUTORIZADA', chave: CHAVE_VENDA_TESTE, numero: '123', serie: '1', urlXml: '/arquivos/x-nfe.xml', urlDanfe: '/arquivos/x.pdf' });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', status_sefaz: '598', mensagem_sefaz: 'Rejeicao: NF-e emitida em ambiente de homologacao' })).toEqual({
      situacao: 'REJEITADA',
      codigo: '598',
      motivo: 'Rejeicao: NF-e emitida em ambiente de homologacao',
    });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', status_sefaz: '302', mensagem_sefaz: 'Uso Denegado' })).toEqual({
      situacao: 'REJEITADA',
      codigo: '302',
      motivo: 'NF denegada pela SEFAZ: Uso Denegado',
    });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', erros: [{ campo: 'cep_destinatario', mensagem: 'deve ter 8 digitos' }] })).toEqual({
      situacao: 'REJEITADA',
      codigo: null,
      motivo: 'cep_destinatario: deve ter 8 digitos',
    });
    expect(interpretarConsultaFocus({ status: 'cancelado', caminho_xml_cancelamento: '/arquivos/c.xml' })).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: '/arquivos/c.xml',
    });
  });

  it('"autorizado" sem a chave ou sem os arquivos, ou status desconhecido: tenta de novo', () => {
    expect(() => interpretarConsultaFocus({ status: 'autorizado' })).toThrow(ErroEmissorIndisponivel);
    expect(() => interpretarConsultaFocus({ status: 'novo_status' })).toThrow(ErroEmissorIndisponivel);
    expect(() => interpretarConsultaFocus(null)).toThrow(ErroEmissorIndisponivel);
  });

  it('cancelamento: cancelado ou recusado', () => {
    expect(interpretarCancelamentoFocus({ status: 'cancelado', status_sefaz: '135', caminho_xml_cancelamento: '/arquivos/c.xml' })).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: '/arquivos/c.xml',
    });
    expect(interpretarCancelamentoFocus({ status: 'erro_cancelamento', mensagem_sefaz: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto' })).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto',
    });
    expect(() => interpretarCancelamentoFocus({ status: 'outro' })).toThrow(ErroEmissorIndisponivel);
  });
});
