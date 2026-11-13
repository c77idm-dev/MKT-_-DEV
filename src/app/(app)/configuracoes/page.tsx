import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Configurações · Gestão de Devoluções' };

/** Spec §6.8. Cada fase troca só a página atrás do seu cartão (contrato §3). */
const CARTOES: { titulo: string; href: string; descricao: string }[] = [
  { titulo: 'Usuários', href: '/configuracoes/usuarios', descricao: 'Criar usuários, mudar o perfil, desativar e reativar.' },
  {
    titulo: 'Conferência e mídias',
    href: '/configuracoes/conferencia',
    descricao: 'Obrigatoriedade do Vídeo de Prova, prazo de guarda das mídias e armazenamento.',
  },
  { titulo: 'Mercado Livre', href: '/configuracoes/mercado-livre', descricao: 'Conexão com a conta do Mercado Livre.' },
  { titulo: 'Fiscal', href: '/configuracoes/fiscal', descricao: 'Dados da empresa, regime tributário, regras fiscais, série e ambiente da NF-e.' },
  { titulo: 'Falhas', href: '/configuracoes/falhas', descricao: 'Tarefas de fundo que esgotaram as tentativas.' },
];

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-xl font-bold">Configurações</h1>
      <ul className="flex flex-col gap-3">
        {CARTOES.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className={`${CARTAO} flex min-h-11 flex-col gap-1 hover:border-destaque`}>
              <span className="text-base font-bold">{c.titulo}</span>
              <span className="text-sm text-texto-2">{c.descricao}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
