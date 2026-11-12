import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { listarUsuarios } from '@/modules/auth/gestao';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { exigirPermissao } from '@/modules/auth/servidor';
import { AcoesUsuario } from './AcoesUsuario';
import { FormularioNovoUsuario } from './FormularioNovoUsuario';

export const metadata: Metadata = { title: 'Usuários · Gestão de Devoluções' };

export default async function PaginaUsuarios() {
  const gestor = await exigirPermissao('administrar');
  const lista = await listarUsuarios(obterDb());
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes" className={LINK_VOLTAR}>
          ← Configurações
        </Link>
        <h1 className="text-xl font-bold">Usuários</h1>
      </div>
      <section aria-labelledby="titulo-novo" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-novo" className="text-base font-bold">
          Novo usuário
        </h2>
        <FormularioNovoUsuario />
      </section>
      <section aria-labelledby="titulo-lista" className="flex flex-col gap-2">
        <h2 id="titulo-lista" className="text-base font-bold">
          Usuários cadastrados
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((u) => (
            <li key={u.id} className={`${CARTAO} flex flex-col gap-3`}>
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold [overflow-wrap:anywhere]">
                  {u.nome}
                  {u.id === gestor.id ? ' (você)' : ''}
                </p>
                <p className="break-all text-sm text-texto-2">{u.email}</p>
                <p className="text-sm text-texto-2">
                  {ROTULO_PERFIL[u.perfil]} · {u.ativo ? 'Ativo' : 'Desativado'}
                </p>
              </div>
              {u.id !== gestor.id && <AcoesUsuario usuario={{ id: u.id, nome: u.nome, perfil: u.perfil, ativo: u.ativo }} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
