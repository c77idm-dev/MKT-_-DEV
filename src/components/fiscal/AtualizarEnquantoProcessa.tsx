'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** (extra) Enquanto a SEFAZ responde, a página se atualiza sozinha a cada 5 s (o worker autoriza em segundo plano). */
export function AtualizarEnquantoProcessa({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);
  return <p className="text-sm text-texto-2">Aguardando a resposta da SEFAZ. Esta página se atualiza sozinha.</p>;
}
