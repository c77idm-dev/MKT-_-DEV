import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Configurações · Gestão de Devoluções' };

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-xl font-bold">Configurações</h1>
      <Link href="/configuracoes/usuarios" className={`${CARTAO} flex min-h-11 flex-col gap-1 hover:border-destaque`}>
        <span className="text-base font-bold">Usuários</span>
        <span className="text-sm text-texto-2">Criar usuários, mudar o perfil, desativar e reativar.</span>
      </Link>
      <p className="text-sm text-texto-2">
        Dados da empresa, regras fiscais, conexão com o Mercado Livre, vídeo e prazo de guarda das mídias chegam nas próximas fases.
      </p>
    </div>
  );
}
