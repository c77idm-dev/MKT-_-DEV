import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { EMPRESA_TESTE } from '../../../tests/helpers/fabricas-fiscal';
import { lerConfiguracaoFiscal, pendenciasFiscais, regraFiscal, salvarAmbiente, salvarDadosEmpresa } from './configuracao';
import { listarRegras, salvarRegra, sugestaoDeRegra } from './regras';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

describe('configuração fiscal no banco', () => {
  it('sem dados, a emissão fica bloqueada e as pendências dizem o que falta (D13)', async () => {
    const faltaEmpresa =
      'Preencha os dados da empresa em Configurações › Fiscal (falta: razão social, CNPJ, inscrição estadual, logradouro, número, bairro, cidade, UF, CEP).';
    await expect(lerConfiguracaoFiscal(db)).rejects.toThrow(faltaEmpresa);
    expect(await pendenciasFiscais(db)).toEqual([faltaEmpresa, 'Escolha o regime tributário em Configurações › Fiscal.']);
  });

  it('salva os dados da empresa, lê como emitente e registra no histórico', async () => {
    await salvarDadosEmpresa(db, EMPRESA_TESTE, gestor);
    expect(await lerConfiguracaoFiscal(db)).toEqual({
      emitente: {
        razaoSocial: 'Empresa Teste Ltda',
        cnpj: '11444777000161',
        ie: '110042490114',
        logradouro: 'Rua A',
        numero: '100',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01001000',
      },
      regime: 'SIMPLES',
      serie: '1',
      ambiente: 'HOMOLOGACAO',
    });
    expect(await listarEventos(db, 'configuracao', 'fiscal')).toEqual([
      expect.objectContaining({ acao: 'configuracao_alterada', usuarioNome: gestor.nome, dados: { secao: 'empresa', regime: 'SIMPLES', serie: '1' } }),
    ]);
    expect(await pendenciasFiscais(db)).toEqual([
      'Falta a regra fiscal: Devolução de venda, dentro do estado',
      'Falta a regra fiscal: Devolução de venda, fora do estado',
    ]);
  });

  it('a regra salva vale; a que não combina com o regime é recusada na emissão', async () => {
    await salvarDadosEmpresa(db, EMPRESA_TESTE, gestor);
    await salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), gestor);
    expect(await regraFiscal(db, 'DEVOLUCAO_VENDA', 'DENTRO_ESTADO')).toMatchObject({ cfop: '1202', icmsSituacaoTributaria: '900' });
    await expect(regraFiscal(db, 'REMESSA_CONSERTO', 'FORA_ESTADO')).rejects.toThrow('Falta a regra fiscal: Remessa para conserto, fora do estado');

    await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime: 'PRESUMIDO' }, gestor);
    await expect(regraFiscal(db, 'DEVOLUCAO_VENDA', 'DENTRO_ESTADO')).rejects.toThrow(
      'Regra fiscal Devolução de venda, dentro do estado: No Lucro Presumido o ICMS usa CST',
    );
  });

  it('salvar de novo atualiza a mesma combinação; a lista traz as 6, salvas ou sugeridas', async () => {
    await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime: 'REAL' }, gestor);
    const regra = sugestaoDeRegra('DEVOLUCAO_VENDA', 'FORA_ESTADO', 'REAL');
    await salvarRegra(db, regra, gestor);
    await salvarRegra(db, { ...regra, naturezaOperacao: 'Devolucao de mercadoria' }, gestor);
    const { regime, regras } = await listarRegras(db);
    expect(regime).toBe('REAL');
    expect(regras.map((r) => [r.tipoNota, r.operacao, r.salva, r.icmsSituacaoTributaria])).toEqual([
      ['DEVOLUCAO_VENDA', 'DENTRO_ESTADO', false, '00'],
      ['DEVOLUCAO_VENDA', 'FORA_ESTADO', true, '00'],
      ['REMESSA_CONSERTO', 'DENTRO_ESTADO', false, '41'],
      ['REMESSA_CONSERTO', 'FORA_ESTADO', false, '41'],
      ['REMESSA_TROCA_GARANTIA', 'DENTRO_ESTADO', false, '41'],
      ['REMESSA_TROCA_GARANTIA', 'FORA_ESTADO', false, '41'],
    ]);
    expect(regras[1]).toMatchObject({ naturezaOperacao: 'Devolucao de mercadoria', atualizadoEm: expect.any(Date) });
  });

  it('troca o ambiente com o histórico de/para', async () => {
    await salvarAmbiente(db, 'PRODUCAO', gestor);
    expect((await listarEventos(db, 'configuracao', 'fiscal')).at(-1)).toMatchObject({ de: 'HOMOLOGACAO', para: 'PRODUCAO' });
  });

  it('só o Gestor altera', async () => {
    await expect(salvarDadosEmpresa(db, EMPRESA_TESTE, fiscal)).rejects.toThrow('Só o Gestor altera as configurações fiscais.');
    await expect(salvarAmbiente(db, 'PRODUCAO', fiscal)).rejects.toThrow('Só o Gestor altera as configurações fiscais.');
    await expect(salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), fiscal)).rejects.toThrow(
      'Só o Gestor altera as regras fiscais.',
    );
  });
});
