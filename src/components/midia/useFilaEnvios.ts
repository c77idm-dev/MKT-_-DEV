'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { registrarEnvioAcao } from '@/modules/midia/acoes';
import { armazemIndexedDb } from './armazemIndexedDb';
import { FilaEnvios, type EnvioConcluido, type NovoEnvio, type RegistroEnvio } from './filaEnvios';
import { criarTransporteTus } from './transporteTus';

let filaDoAparelho: FilaEnvios | null = null;

/** Uma fila só no aparelho (todas as telas usam a mesma, e ela continua de uma tela para a outra). */
function fila(): FilaEnvios {
  filaDoAparelho ??= new FilaEnvios(armazemIndexedDb(), criarTransporteTus(registrarEnvioAcao));
  return filaDoAparelho;
}

/**
 * Envios de uma devolução. Tenta de novo ao abrir a tela, quando a rede volta, quando o app volta ao primeiro
 * plano e a cada 2 s (só o que já passou da espera). O iPhone não envia com o app fechado (pesquisa §4).
 */
export function useFilaEnvios(devolucaoId: string, aoConcluir?: (e: EnvioConcluido) => void) {
  const [envios, setEnvios] = useState<RegistroEnvio[]>([]);
  const [concluidos, setConcluidos] = useState<EnvioConcluido[]>([]);
  const aoConcluirRef = useRef(aoConcluir);
  useEffect(() => {
    aoConcluirRef.current = aoConcluir;
  }, [aoConcluir]);

  useEffect(() => {
    const f = fila();
    let viva = true;
    const atualizar = () => {
      void f.listar().then((lista) => {
        if (viva) setEnvios(lista.filter((r) => r.devolucaoId === devolucaoId));
      });
    };
    const pararMudar = f.aoMudar(atualizar);
    const pararConcluir = f.aoConcluir((e) => {
      if (e.devolucaoId !== devolucaoId) return;
      setConcluidos((lista) => [...lista.filter((x) => !(x.tipo === e.tipo && x.itemId === e.itemId)), e]);
      aoConcluirRef.current?.(e);
    });
    const tentar = () => void f.processar();
    const voltouARede = () => void f.processar(true);
    const voltouAoApp = () => {
      if (document.visibilityState === 'visible') tentar();
    };
    window.addEventListener('online', voltouARede);
    document.addEventListener('visibilitychange', voltouAoApp);
    const relogio = window.setInterval(tentar, 2000);
    // Pede ao navegador para não apagar o IndexedDB quando faltar espaço (pesquisa §4).
    void navigator.storage?.persist?.().catch(() => false);
    atualizar();
    tentar();
    return () => {
      viva = false;
      pararMudar();
      pararConcluir();
      window.removeEventListener('online', voltouARede);
      document.removeEventListener('visibilitychange', voltouAoApp);
      window.clearInterval(relogio);
    };
  }, [devolucaoId]);

  const adicionar = useCallback((novo: Omit<NovoEnvio, 'devolucaoId'>) => fila().adicionar({ ...novo, devolucaoId }), [devolucaoId]);
  const tentarDeNovo = useCallback((idCliente: string) => fila().tentarDeNovo(idCliente), []);
  const descartar = useCallback((idCliente: string) => fila().descartar(idCliente), []);
  return { envios, concluidos, adicionar, tentarDeNovo, descartar };
}
