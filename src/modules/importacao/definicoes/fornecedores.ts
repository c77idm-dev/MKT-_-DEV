import { formatarCnpj } from '@/modules/catalogo/documentos';
import { interpretarLinhaFornecedor, upsertFornecedores } from '@/modules/catalogo/fornecedores';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';

/** Modelo sugerido da spec §6.8: razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contato_sac, email_sac. */
export const definicaoFornecedores: DefinicaoImportacao = {
  tipo: 'fornecedores',
  titulo: 'Fornecedores',
  acao: 'gerir_catalogo',
  voltarPara: '/cadastros/fornecedores',
  rotuloCriados: 'Fornecedores novos',
  rotuloAtualizados: 'Fornecedores atualizados',
  campos: [
    { chave: 'razao_social', rotulo: 'Razão social', obrigatorio: true, sinonimos: ['razao social', 'nome', 'fornecedor', 'empresa', 'nome empresarial'] },
    { chave: 'cnpj', rotulo: 'CNPJ', obrigatorio: true, sinonimos: ['cnpj', 'documento', 'cnpj do fornecedor'] },
    { chave: 'ie', rotulo: 'Inscrição estadual', obrigatorio: false, sinonimos: ['ie', 'inscricao estadual', 'insc estadual'] },
    { chave: 'logradouro', rotulo: 'Logradouro', obrigatorio: false, sinonimos: ['endereco', 'rua', 'logradouro'] },
    { chave: 'numero', rotulo: 'Número', obrigatorio: false, sinonimos: ['numero', 'num', 'n'] },
    { chave: 'complemento', rotulo: 'Complemento', obrigatorio: false, sinonimos: ['complemento'] },
    { chave: 'bairro', rotulo: 'Bairro', obrigatorio: false, sinonimos: ['bairro'] },
    { chave: 'cidade', rotulo: 'Cidade', obrigatorio: false, sinonimos: ['cidade', 'municipio'] },
    { chave: 'uf', rotulo: 'UF', obrigatorio: false, sinonimos: ['uf', 'estado'] },
    { chave: 'cep', rotulo: 'CEP', obrigatorio: false, sinonimos: ['cep'] },
    { chave: 'contato_sac', rotulo: 'Contato do SAC', obrigatorio: false, sinonimos: ['contato', 'sac', 'telefone', 'telefone sac', 'contato sac'] },
    { chave: 'email_sac', rotulo: 'E-mail do SAC', obrigatorio: false, sinonimos: ['email', 'e-mail', 'email sac', 'e-mail sac'] },
  ],
  async validar(_db, linhas) {
    const interpretadas = linhas.map((linha) => ({ linha, ...interpretarLinhaFornecedor(linha.valores) }));
    // Chave repetida na mesma planilha: vale a última linha; as anteriores viram erro (o upsert não aceita a mesma chave duas vezes).
    const ultimaLinha = new Map<string, number>();
    for (const { linha, dados } of interpretadas) if (dados) ultimaLinha.set(dados.cnpj, linha.numeroLinha);
    return interpretadas.map(({ linha, dados, erros }) => {
      const ultima = dados ? ultimaLinha.get(dados.cnpj) : undefined;
      if (dados && ultima !== undefined && ultima !== linha.numeroLinha) {
        erros.push(`linha repetida: o CNPJ ${formatarCnpj(dados.cnpj)} aparece de novo na linha ${ultima}`);
      }
      return { ...linha, erros, avisos: [] };
    });
  },
  async aplicar(db, linhas) {
    return upsertFornecedores(db, linhas.map((l) => dadosOuErro(interpretarLinhaFornecedor(l.valores), l.numeroLinha)));
  },
};
