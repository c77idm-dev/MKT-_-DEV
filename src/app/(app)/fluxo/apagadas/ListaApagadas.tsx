'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_SECUNDARIO, CARTAO, VAZIO } from '@/components/estilos';
import { PRAZO_APAGADAS_DIAS, textoSomeEm } from '@/modules/apagadas/dominio';
import type { ResultadoRestaurar } from './acoes';

/** Um item da lista, já pronto para a tela (a data vem formatada do servidor, no fuso do sistema). */
export type ApagadaVista = {
  tipo: 'devolucao' | 'retirada';
  id: string;
  codigo: string;
  situacao: string;
  apagadaEmTexto: string;
  apagadaPorNome: string | null;
  diasParaSumir: number;
  href: string;
};

type Restaurada = { vez: number; texto: string; aviso: string | null };

function Linha({ item, restaurar, aoRestaurar }: { item: ApagadaVista; restaurar: (tipo: string, id: string) => Promise<ResultadoRestaurar>; aoRestaurar: (r: { codigo: string; situacao: string; aviso: string | null }) => void }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function aoTocar() {
    setErro(null);
    iniciar(async () => {
      const r = await restaurar(item.tipo, item.id);
      if (r.ok) aoRestaurar({ codigo: item.codigo, situacao: item.situacao, aviso: r.aviso });
      else setErro(r.mensagem);
    });
  }

  return (
    <li className={`${CARTAO} flex flex-col gap-1.5 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={item.href} className="inline-flex min-h-11 items-center font-mono text-base font-bold text-destaque">
          {item.codigo}
        </Link>
        <Selo texto={item.tipo === 'devolucao' ? 'Devolução' : 'Retirada do Full'} tom="neutro" />
      </div>
      <p className="text-sm">
        Estava em: <span className="font-semibold">{item.situacao}</span>
      </p>
      <p className="text-sm text-texto-2">
        Apagada em {item.apagadaEmTexto}
        {item.apagadaPorNome ? ` por ${item.apagadaPorNome}` : ''}
      </p>
      <p className="text-sm font-semibold text-atencao">{textoSomeEm(item.diasParaSumir)}</p>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      <button type="button" onClick={aoTocar} disabled={pendente} aria-label={`Restaurar ${item.codigo}`} className={`${BOTAO_SECUNDARIO} mt-1 w-full sm:w-auto sm:self-start`}>
        {pendente ? 'Restaurando…' : 'Restaurar'}
      </button>
    </li>
  );
}

/**
 * Lista "Apagadas" (extra, emenda E29), só do Gestor: o que foi apagado, por quem e quando, e quando some de vez, com
 * "Restaurar". A confirmação fica no alto, fora da lista: a linha restaurada some quando a página é atualizada.
 */
export function ListaApagadas({ itens, restaurar }: { itens: ApagadaVista[]; restaurar: (tipo: string, id: string) => Promise<ResultadoRestaurar> }) {
  const [restaurada, setRestaurada] = useState<Restaurada | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {restaurada && (
        <div className="flex flex-col gap-2">
          {/* A chave remonta a mensagem: cada restauração leva o foco a ela de novo. */}
          <MensagemSucesso key={restaurada.vez} texto={restaurada.texto} />
          {restaurada.aviso && (
            <p role="note" className={ALERTA_ATENCAO}>
              {restaurada.aviso}
            </p>
          )}
        </div>
      )}
      {itens.length === 0 ? (
        <p className={VAZIO}>Nada apagado nos últimos {PRAZO_APAGADAS_DIAS} dias.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((item) => (
            <Linha
              key={`${item.tipo}-${item.id}`}
              item={item}
              restaurar={restaurar}
              aoRestaurar={(r) =>
                setRestaurada((antes) => ({ vez: (antes?.vez ?? 0) + 1, texto: `${r.codigo} restaurada. Ela voltou para ${r.situacao}.`, aviso: r.aviso }))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
