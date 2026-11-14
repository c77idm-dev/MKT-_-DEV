'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PERIGO, BOTAO_PRIMARIO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { conectarAcao, desconectarAcao, type EstadoConta } from './acoes';

const INICIAL: EstadoConta = { erros: [] };

export function BotaoConectar({ rotulo }: { rotulo: string }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(conectarAcao, INICIAL, 'erros-conectar');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <p className="text-sm text-texto-2">Entre com a conta administradora principal do Mercado Livre (conta de colaborador não funciona).</p>
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
        {pendente ? 'Abrindo o Mercado Livre…' : rotulo}
      </button>
      <ListaErros erros={estado.erros} id="erros-conectar" />
    </form>
  );
}

/** Ação sem volta: segundo toque (como "Desativar" em Usuários). */
export function BotaoDesconectar() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(desconectarAcao, INICIAL, 'erros-desconectar');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2 border-t border-borda pt-3">
      <BotaoConfirmar rotulo="Desconectar" rotuloConfirmar="Toque de novo para desconectar" desabilitado={pendente} className={BOTAO_PERIGO} />
      <ListaErros erros={estado.erros} id="erros-desconectar" />
    </form>
  );
}
