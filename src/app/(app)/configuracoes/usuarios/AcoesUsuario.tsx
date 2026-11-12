'use client';

import { useActionState, useEffect, useState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { OpcoesPerfil } from '@/components/OpcoesPerfil';
import { ALERTA_OK, BOTAO_PERIGO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import type { Perfil } from '@/modules/auth/perfis';
import { alterarPerfilAcao, definirAtivoAcao, type EstadoAcaoUsuario } from './acoes';

type Props = { usuario: { id: string; nome: string; perfil: Perfil; ativo: boolean } };

const SEM_RESULTADO: EstadoAcaoUsuario = { erro: null, ok: null };
/** Quanto tempo o segundo toque de "Desativar" continua valendo. */
const TEMPO_CONFIRMACAO_MS = 5000;

export function AcoesUsuario({ usuario }: Props) {
  const [estadoPerfil, enviarPerfil, mudandoPerfil] = useActionState(alterarPerfilAcao.bind(null, usuario.id), SEM_RESULTADO);
  const [estadoAtivo, enviarAtivo, mudandoAtivo] = useActionState(definirAtivoAcao.bind(null, usuario.id, !usuario.ativo), SEM_RESULTADO);
  const [confirmando, setConfirmando] = useState(false);
  // Só o resultado da última ação aparece (o da anterior ficaria velho na tela).
  const [ultima, setUltima] = useState<'perfil' | 'ativo' | null>(null);

  // O segundo toque só vale por alguns segundos; depois o botão volta ao normal.
  useEffect(() => {
    if (!confirmando) return;
    const espera = setTimeout(() => setConfirmando(false), TEMPO_CONFIRMACAO_MS);
    return () => clearTimeout(espera);
  }, [confirmando]);

  const estado = ultima === 'perfil' ? estadoPerfil : ultima === 'ativo' ? estadoAtivo : SEM_RESULTADO;
  const erros = estado.erro ? [estado.erro] : [];
  const aviso =
    estado.ok === 'perfil'
      ? `Perfil de ${usuario.nome} salvo.`
      : estado.ok === 'desativado'
        ? `${usuario.nome} desativado.`
        : estado.ok === 'reativado'
          ? `${usuario.nome} reativado.`
          : null;

  return (
    <div className="flex flex-col gap-2">
      <form action={enviarPerfil} onSubmit={() => setUltima('perfil')} className="flex items-end gap-2">
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
      <div role="status" className="flex flex-col gap-2 empty:hidden">
        {aviso && <p className={ALERTA_OK}>{aviso}</p>}
      </div>
      <ListaErros erros={erros} id={`erros-usuario-${usuario.id}`} />
      {/* Linha própria, em vermelho e com segundo toque: no celular ninguém desativa sem querer. */}
      <form action={enviarAtivo} onSubmit={() => {
          setConfirmando(false);
          setUltima('ativo');
        }} className="mt-1 border-t border-borda pt-3">
        {usuario.ativo ? (
          <button
            type="button"
            onClick={(evento) => {
              if (!confirmando) return setConfirmando(true);
              // Sempre type="button": se o tipo virasse "submit" no meio do toque, o primeiro toque já enviaria.
              evento.currentTarget.form?.requestSubmit();
            }}
            disabled={mudandoAtivo}
            aria-label={confirmando ? `Confirmar: desativar ${usuario.nome}` : `Desativar ${usuario.nome}`}
            className={BOTAO_PERIGO}
          >
            {confirmando ? `Toque de novo para desativar ${usuario.nome}` : 'Desativar'}
          </button>
        ) : (
          <button type="submit" disabled={mudandoAtivo} aria-label={`Reativar ${usuario.nome}`} className={`${BOTAO_SECUNDARIO} w-full`}>
            Reativar
          </button>
        )}
      </form>
    </div>
  );
}
