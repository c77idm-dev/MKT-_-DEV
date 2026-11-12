import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { obterFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarFornecedorAcao } from '../acoes';
import { FormularioFornecedor } from '../FormularioFornecedor';

export const metadata: Metadata = { title: 'Editar fornecedor · Gestão de Devoluções' };

export default async function PaginaEditarFornecedor({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao('gerir_catalogo');
  const { id } = await params;
  const f = await obterFornecedor(obterDb(), id);
  if (!f) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/fornecedores" className={LINK_VOLTAR}>
        ← Fornecedores
      </Link>
      <h1 className="text-xl font-bold">Editar fornecedor</h1>
      <FormularioFornecedor
        acao={salvarFornecedorAcao.bind(null, f.id)}
        valores={{
          razao_social: f.razaoSocial,
          cnpj: formatarCnpj(f.cnpj),
          ie: f.ie ?? '',
          logradouro: f.logradouro ?? '',
          numero: f.numero ?? '',
          complemento: f.complemento ?? '',
          bairro: f.bairro ?? '',
          cidade: f.cidade ?? '',
          uf: f.uf ?? '',
          cep: f.cep ?? '',
          contato_sac: f.contatoSac ?? '',
          email_sac: f.emailSac ?? '',
        }}
      />
    </div>
  );
}
