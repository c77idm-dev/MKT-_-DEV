'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ALERTA_ERRO, CARTAO } from '@/components/estilos';
import { LIMITE_EXTRA_POR_UNIDADE } from '@/modules/midia/dominio';
import { textoDoSlot, type FotoExtra } from './estadoSlot';
import { BarraProgresso, BotaoArquivo, useMiniatura } from './SlotEvidencia';

/** Botões das miniaturas: estreitos (2 por linha no celular), mas com 44 px de altura. */
const BOTAO_PEQUENO =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border px-2 text-center text-sm font-semibold leading-tight disabled:opacity-60';
const BOTAO_PEQUENO_NEUTRO = `${BOTAO_PEQUENO} border-borda-campo bg-superficie text-texto hover:bg-fundo`;
const BOTAO_PEQUENO_PERIGO = `${BOTAO_PEQUENO} border-erro bg-superficie text-erro hover:bg-erro-suave`;

function IconeCamera() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

type PropsMiniatura = {
  foto: FotoExtra;
  numero: number;
  confirmando: boolean;
  removendo: boolean;
  aoPedirRemocao: () => void;
  aoCancelar: () => void;
  aoConfirmar: () => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

function MiniaturaAvaria({ foto, numero, confirmando, removendo, aoPedirRemocao, aoCancelar, aoConfirmar, aoTentarDeNovo }: PropsMiniatura) {
  const { estado } = foto;
  const imagem = useMiniatura(estado, false);
  const nome = `Foto da avaria ${numero}`;
  const comErro = estado.tipo === 'nao_enviada' || estado.tipo === 'falhou';
  const borda = estado.tipo === 'enviada' ? 'border-bom' : comErro ? 'border-erro' : 'border-destaque';
  const corTexto = estado.tipo === 'enviada' ? 'text-bom' : comErro ? 'text-erro' : 'text-texto-2';
  return (
    <div role="group" aria-label={nome} className={`flex h-full flex-col gap-2 rounded-xl border-2 bg-superficie p-2 ${borda}`}>
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element -- link temporário ou object URL: não passa pelo otimizador de imagens
        <img src={imagem} alt="" className="aspect-square w-full rounded-lg object-cover" />
      ) : (
        <span aria-hidden="true" className="flex aspect-square w-full items-center justify-center rounded-lg bg-fundo text-texto-2">
          <IconeCamera />
        </span>
      )}
      <p aria-live="polite" className={`text-sm font-semibold ${corTexto}`}>
        {estado.tipo === 'enviada' && <span aria-hidden="true">✓ </span>}
        {textoDoSlot(estado)}
      </p>
      {estado.tipo === 'enviando' && <BarraProgresso valor={estado.progresso} rotulo={`Envio da foto da avaria ${numero}`} />}
      {comErro && (
        <p role="alert" className={`${ALERTA_ERRO} break-words`}>
          {estado.mensagem}
        </p>
      )}
      {(estado.tipo === 'nao_enviada' || estado.tipo === 'aguardando') && (
        <button type="button" onClick={() => aoTentarDeNovo(estado.registro.idCliente)} className={BOTAO_PEQUENO_NEUTRO}>
          Tentar de novo
        </button>
      )}
      <div className="mt-auto flex flex-col gap-2">
        {confirmando ? (
          <>
            <button type="button" onClick={aoConfirmar} disabled={removendo} className={BOTAO_PEQUENO_PERIGO}>
              {removendo ? 'Removendo…' : 'Confirmar remoção'}
            </button>
            <button type="button" onClick={aoCancelar} disabled={removendo} className={BOTAO_PEQUENO_NEUTRO}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={aoPedirRemocao} className={BOTAO_PEQUENO_NEUTRO}>
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

type Props = {
  fotos: FotoExtra[];
  aoEscolher: (arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
  /** Devolve a mensagem de erro, ou null quando removeu. */
  aoRemover: (foto: FotoExtra) => Promise<string | null>;
};

/**
 * Melhoria 2: "Fotos da avaria (opcional)" no passo de cada unidade. Fotos EXTRA de perto da avaria ou de um detalhe,
 * até 6, com a mesma compressão e a mesma fila offline das Fotos 1 a 4. Remover pede um segundo toque.
 */
export function FotosAvaria({ fotos, aoEscolher, aoTentarDeNovo, aoRemover }: Props) {
  const id = useId();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixaErro = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (erro) caixaErro.current?.focus();
  }, [erro]);

  async function confirmar(foto: FotoExtra) {
    setRemovendo(true);
    setErro(null);
    try {
      const mensagem = await aoRemover(foto);
      setErro(mensagem);
      if (!mensagem) setConfirmando(null);
    } finally {
      setRemovendo(false);
    }
  }

  const noLimite = fotos.length >= LIMITE_EXTRA_POR_UNIDADE;
  return (
    <section aria-labelledby={`${id}-titulo`} className={`${CARTAO} flex flex-col gap-3`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-titulo`} className="text-base font-bold">
          Fotos da avaria (opcional)
        </h3>
        <p className="text-sm text-texto-2">
          Se a unidade tem avaria ou um detalhe, tire fotos de perto.{' '}
          {fotos.length > 0 ? `${fotos.length} de ${LIMITE_EXTRA_POR_UNIDADE}.` : `Até ${LIMITE_EXTRA_POR_UNIDADE}.`}
        </p>
      </div>
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {fotos.map((foto, i) => (
            <li key={foto.chave} className="min-w-0">
              <MiniaturaAvaria
                foto={foto}
                numero={i + 1}
                confirmando={confirmando === foto.chave}
                removendo={removendo && confirmando === foto.chave}
                aoPedirRemocao={() => {
                  setErro(null);
                  setConfirmando(foto.chave);
                }}
                aoCancelar={() => setConfirmando(null)}
                aoConfirmar={() => void confirmar(foto)}
                aoTentarDeNovo={aoTentarDeNovo}
              />
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p ref={caixaErro} tabIndex={-1} role="alert" className={`${ALERTA_ERRO} outline-none`}>
          {erro}
        </p>
      )}
      {noLimite ? (
        <p className="text-sm font-semibold text-texto-2">Limite de {LIMITE_EXTRA_POR_UNIDADE} fotos da avaria nesta unidade.</p>
      ) : (
        <BotaoArquivo rotulo="Adicionar foto" accept="image/*" capture principal={false} aoEscolher={aoEscolher} />
      )}
    </section>
  );
}
