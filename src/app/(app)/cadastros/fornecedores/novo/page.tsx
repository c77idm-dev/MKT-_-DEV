import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { salvarFornecedorAcao } from '../acoes';
import { FormularioFornecedor } from '../FormularioFornecedor';

export const metadata: Metadata = { title: 'Novo fornecedor · Gestão de Devoluções' };

const SEM_VALORES = {
  razao_social: '',
  cnpj: '',
  ie: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  contato_sac: '',
  email_sac: '',
};

export default async function PaginaNovoFornecedor() {
  await exigirPermissao('gerir_catalogo');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/fornecedores" className={LINK_VOLTAR}>
        ← Fornecedores
      </Link>
      <h1 className="text-xl font-bold">Novo fornecedor</h1>
      <FormularioFornecedor acao={salvarFornecedorAcao.bind(null, null)} valores={SEM_VALORES} />
    </div>
  );
}
