import { formatarCnpj } from '@/modules/catalogo/documentos';
import { idsDosFornecedores } from '@/modules/catalogo/fornecedores';
import { interpretarLinhaProduto, upsertProdutos } from '@/modules/catalogo/produtos';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';

/** Modelo sugerido da spec §6.8: sku, ean, descricao, cnpj_fornecedor, ncm, custo, unidade. */
export const definicaoProdutos: DefinicaoImportacao = {
  tipo: 'produtos',
  titulo: 'Produtos',
  acao: 'gerir_catalogo',
  voltarPara: '/cadastros/produtos',
  rotuloCriados: 'Produtos novos',
  rotuloAtualizados: 'Produtos atualizados',
  campos: [
    { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['codigo', 'cod', 'codigo do produto', 'referencia', 'ref'] },
    { chave: 'ean', rotulo: 'EAN (código de barras)', obrigatorio: false, sinonimos: ['ean', 'gtin', 'codigo de barras', 'cod barras', 'ean13'] },
    { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['produto', 'nome do produto', 'nome'] },
    { chave: 'cnpj_fornecedor', rotulo: 'CNPJ do fornecedor', obrigatorio: false, sinonimos: ['cnpj fornecedor', 'fornecedor cnpj', 'cnpj'] },
    { chave: 'ncm', rotulo: 'NCM', obrigatorio: false, sinonimos: ['ncm'] },
    { chave: 'custo', rotulo: 'Custo', obrigatorio: false, sinonimos: ['custo', 'preco de custo', 'valor de custo', 'custo unitario'] },
    { chave: 'unidade', rotulo: 'Unidade', obrigatorio: false, sinonimos: ['un', 'unid', 'unidade de medida'] },
  ],
  async validar(db, linhas) {
    const interpretadas = linhas.map((linha) => ({ linha, ...interpretarLinhaProduto(linha.valores) }));
    const cnpjs = [...new Set(interpretadas.flatMap((i) => (i.dados?.cnpjFornecedor ? [i.dados.cnpjFornecedor] : [])))];
    const existentes = await idsDosFornecedores(db, cnpjs);
    // Chave repetida na mesma planilha: vale a última linha; as anteriores viram erro (o upsert não aceita a mesma chave duas vezes).
    const ultimaLinha = new Map<string, number>();
    for (const { linha, dados } of interpretadas) if (dados) ultimaLinha.set(dados.sku, linha.numeroLinha);
    return interpretadas.map(({ linha, dados, erros }) => {
      if (dados) {
        if (dados.cnpjFornecedor && !existentes.has(dados.cnpjFornecedor)) {
          erros.push(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(dados.cnpjFornecedor)}). Importe os fornecedores antes.`);
        }
        const ultima = ultimaLinha.get(dados.sku);
        if (ultima !== undefined && ultima !== linha.numeroLinha) {
          erros.push(`linha repetida: o SKU ${dados.sku} aparece de novo na linha ${ultima}`);
        }
      }
      return { ...linha, erros, avisos: [] };
    });
  },
  async aplicar(db, linhas) {
    return upsertProdutos(db, linhas.map((l) => dadosOuErro(interpretarLinhaProduto(l.valores), l.numeroLinha)));
  },
};
