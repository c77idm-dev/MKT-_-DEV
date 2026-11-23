'use client';

import { useEffect, useRef, useState } from 'react';
import { BOTAO_SECUNDARIO } from '@/components/estilos';
import { caminhoDossie, cookieDossiePronto } from '@/modules/dossie/dominio';

/** De quanto em quanto tempo a tela olha se o PDF ficou pronto (o cookie da marca chegou com o download). */
const INTERVALO_MS = 500;
/** Sem o cookie até aqui, o botão libera (a rota tem prazo de 100 s e o nginx espera 120 s). */
const ESPERA_MAX_MS = 120_000;

const TEXTO = {
  livre: '',
  gerando: 'Gerando o PDF… pode levar até 1 minuto. O download começa sozinho.',
  demorou: 'Se o download não começou, toque de novo.',
} as const;

/** 8 bytes aleatórios em hexadecimal: a marca deste toque (?n=). */
function novaMarca(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function cookieChegou(nome: string): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${nome}=`));
}

/**
 * Dossiê de provas (PDF) (extra). Um link comum, sem o atributo `download`: o nome do arquivo vem do Content-Disposition
 * da rota, e a sessão vencida leva à tela de login (em vez de salvar o HTML dela como .pdf). Cada toque leva uma marca
 * (?n=); o PDF pronto volta com o cookie dela, que encerra o aviso "Gerando…" e libera o botão. Até lá, um 2º toque
 * não gera outro dossiê (e, se gerasse, o servidor juntaria os dois pedidos).
 */
export function BotaoDossie({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<keyof typeof TEXTO>('livre');
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const parar = () => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  };
  useEffect(() => parar, []);

  function esperarOPdf(marca: string) {
    parar();
    const nome = cookieDossiePronto(marca);
    const inicio = Date.now();
    relogio.current = setInterval(() => {
      if (cookieChegou(nome)) {
        document.cookie = `${nome}=; Max-Age=0; Path=/`;
        parar();
        setEstado('livre');
      } else if (Date.now() - inicio >= ESPERA_MAX_MS) {
        parar();
        setEstado('demorou');
      }
    }, INTERVALO_MS);
  }

  const gerando = estado === 'gerando';
  const idDica = `dica-dossie-${codigo}`;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={caminhoDossie(codigo)}
        aria-describedby={idDica}
        aria-disabled={gerando || undefined}
        onClick={(evento) => {
          if (gerando) {
            evento.preventDefault();
            return;
          }
          const marca = novaMarca();
          // O navegador lê o href depois do clique: o pedido sai com a marca deste toque.
          evento.currentTarget.href = caminhoDossie(codigo, marca);
          setEstado('gerando');
          esperarOPdf(marca);
        }}
        className={`${BOTAO_SECUNDARIO} w-full text-center md:w-auto md:self-start ${gerando ? 'cursor-wait' : ''}`}
      >
        Baixar dossiê de provas (PDF)
      </a>
      <p id={idDica} className="text-xs text-texto-2">
        (extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.
      </p>
      <p role="status" className="text-xs font-semibold text-texto-2">
        {TEXTO[estado]}
      </p>
    </div>
  );
}
