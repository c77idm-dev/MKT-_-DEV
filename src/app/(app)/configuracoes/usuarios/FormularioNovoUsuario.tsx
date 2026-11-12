'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { OpcoesPerfil } from '@/components/OpcoesPerfil';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { ALERTA_OK, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { criarUsuarioAcao } from './acoes';

export function FormularioNovoUsuario() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(criarUsuarioAcao, { erros: [], criado: null, versao: 0 });
  return (
    <div className="flex flex-col gap-3">
      {estado.criado && (
        <p role="status" className={ALERTA_OK}>
          Usuário {estado.criado} criado.
        </p>
      )}
      <form key={estado.versao} onSubmit={aoEnviar} className="flex flex-col gap-3">
        <CampoTexto nome="nome" rotulo="Nome" obrigatorio maximo={120} />
        <CampoTexto nome="email" rotulo="E-mail" tipo="email" modoTeclado="email" autoComplete="off" obrigatorio maximo={200} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="perfil" className={ROTULO}>
            Perfil
          </label>
          <select id="perfil" name="perfil" defaultValue="OPERADOR" className={CAMPO}>
            <OpcoesPerfil />
          </select>
        </div>
        <CampoTexto
          nome="senha"
          rotulo="Senha inicial"
          tipo="password"
          obrigatorio
          autoComplete="new-password"
          dica="Pelo menos 8 caracteres. A pessoa entra com esta senha."
        />
        <ListaErros erros={estado.erros} />
        <RodapeFormulario>
          <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
            {pendente ? 'Criando…' : 'Criar usuário'}
          </button>
        </RodapeFormulario>
      </form>
    </div>
  );
}
