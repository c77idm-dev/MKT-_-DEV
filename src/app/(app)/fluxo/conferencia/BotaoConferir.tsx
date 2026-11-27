'use client';

import { useActionState, type ReactNode } from 'react';
import { ALERTA_ERRO } from '@/components/estilos';
import { useTravaToqueDuplo } from '@/components/venda/useTravaToqueDuplo';
import { abrirConferenciaAcao, type EstadoConferirPacote } from './acoes';

const SEM_ERRO: EstadoConferirPacote = { erros: [] };

/**
 * (E29) "Conferir" e "Conferir agora" da Bancada do Operador: abre a conferência da devolução, travada com quem tocou, e
 * vai para a tela da conferência. É a mesma ação do Conferir pacote, pelo código DEV; quem decide se pode conferir (trava
 * de outra pessoa, não identificada, sem unidades) é o servidor, e o motivo aparece embaixo do botão.
 * Vale só 0,7 s depois de aparecer: o cartão verde e a fila empurram a tela, e o 2º toque de um toque duplo cairia aqui
 * (a mesma trava da ficha da E27). Para recomeçar a trava, a tela remonta o botão (key).
 */
export function BotaoConferir({ codigo, className, children }: { codigo: string; className: string; children: ReactNode }) {
  const [estado, acao, pendente] = useActionState(abrirConferenciaAcao, SEM_ERRO);
  const cedoDemais = useTravaToqueDuplo();
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (cedoDemais()) evento.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="codigo" value={codigo} />
      <button type="submit" disabled={pendente} className={className}>
        {pendente ? 'Abrindo…' : children}
      </button>
      {estado.erros.length > 0 && (
        <p role="alert" className={ALERTA_ERRO}>
          {estado.erros.join(' ')}
        </p>
      )}
    </form>
  );
}
