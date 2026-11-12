import type { DbOuTx } from '@/db/client';
import type { Perfil } from '@/modules/auth/perfis';
import { criarUsuario, type UsuarioSessao } from '@/modules/auth/usuarios';
import { salvarFornecedor, type DadosFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarProduto, type DadosProduto } from '@/modules/catalogo/produtos';
import { criarDevolucao, type DadosNovaDevolucao, type DevolucaoCriada } from '@/modules/devolucoes/criar';

/** Fábricas de dados para os testes de integração e ponta a ponta (não existem dados de demonstração). */
let contador = 0;
function proximo(): number {
  contador += 1;
  return contador;
}

export async function criarUsuarioTeste(db: DbOuTx, perfil: Perfil = 'OPERADOR'): Promise<UsuarioSessao> {
  const n = proximo();
  return criarUsuario(db, {
    nome: `Usuário Teste ${n}`,
    email: `usuario${n}-${Date.now()}@teste.local`,
    senha: 'senha-de-teste-123',
    perfil,
  });
}

export async function criarFornecedorTeste(db: DbOuTx, dados: Partial<DadosFornecedor> = {}): Promise<string> {
  return salvarFornecedor(db, {
    razaoSocial: 'Fornecedor Teste Ltda',
    cnpj: '11222333000181',
    ie: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    contatoSac: null,
    emailSac: null,
    ...dados,
  });
}

export async function criarProdutoTeste(db: DbOuTx, dados: Partial<DadosProduto> = {}): Promise<string> {
  return salvarProduto(db, {
    sku: `SKU-TESTE-${proximo()}`,
    ean: null,
    descricao: 'Produto de teste',
    cnpjFornecedor: null,
    ncm: null,
    custo: null,
    unidade: 'UN',
    ...dados,
  });
}

export async function criarDevolucaoTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada> {
  const n = proximo();
  const marca = Date.now().toString(36).toUpperCase();
  return criarDevolucao(
    db,
    {
      canal: 'SHOPEE',
      pedido: `PED-TESTE-${n}-${marca}`,
      reclamacaoId: null,
      rastreio: `TST${n}X${marca}`,
      transportadora: 'Correios',
      motivoCliente: null,
      postadaEm: null,
      itens: [{ sku: 'SKU-TESTE', quantidade: 1 }],
      ...dados,
    },
    { origem: 'MANUAL', usuario },
  );
}
