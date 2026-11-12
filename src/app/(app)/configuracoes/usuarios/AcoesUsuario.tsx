'use client';

import { useActionState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { OpcoesPerfil } from '@/components/OpcoesPerfil';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import type { Perfil } from '@/modules/auth/perfis';
import { alterarPerfilAcao, definirAtivoAcao } from './acoes';

type Props = { usuario: { id: string; nome: string; perfil: Perfil; ativo: boolean } };

export function AcoesUsuario({ usuario }: Props) {
  const [estadoPerfil, enviarPerfil, mudandoPerfil] = useActionState(alterarPerfilAcao.bind(null, usuario.id), { erro: null });
  const [estadoAtivo, enviarAtivo, mudandoAtivo] = useActionState(definirAtivoAcao.bind(null, usuario.id, !usuario.ativo), { erro: null });
  const erros = [estadoPerfil.erro, estadoAtivo.erro].filter((e): e is string => e !== null);
  return (
    <div className="flex flex-col gap-2">
      <form action={enviarPerfil} className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`perfil-${usuario.id}`} className={ROTULO}>
            Perfil<span className="sr-only"> de {usuario.nome}</span>
          </label>
          <select id={`perfil-${usuario.id}`} name="perfil" defaultValue={usuario.perfil} className={CAMPO}>
            <OpcoesPerfil />
          </select>
        </div>
        <button type="submit" disabled={mudandoPerfil} aria-label={`Salvar perfil de ${usuario.nome}`} className={BOTAO_SECUNDARIO}>
          Salvar
        </button>
      </form>
      <form action={enviarAtivo}>
        <button
          type="submit"
          disabled={mudandoAtivo}
          aria-label={`${usuario.ativo ? 'Desativar' : 'Reativar'} ${usuario.nome}`}
          className={`${BOTAO_SECUNDARIO} w-full`}
        >
          {usuario.ativo ? 'Desativar' : 'Reativar'}
        </button>
      </form>
      <ListaErros erros={erros} />
    </div>
  );
}
