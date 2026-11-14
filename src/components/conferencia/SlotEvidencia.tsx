'use client';

import { useEffect, useId, useMemo } from 'react';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { textoDoSlot, type EstadoSlot } from './estadoSlot';

function IconeCamera() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconeVideo() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}

export function BarraProgresso({ valor, rotulo }: { valor: number; rotulo: string }) {
  const porcento = Math.round(Math.min(1, Math.max(0, valor)) * 100);
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcento} className="h-2.5 w-full overflow-hidden rounded-full bg-coluna">
      <div className="h-full rounded-full bg-destaque" style={{ width: `${porcento}%` }} />
    </div>
  );
}

/**
 * Botão grande (56 px) que abre a câmera do celular (`capture`) ou o seletor de arquivos. O <input> fica dentro do
 * <label>: o nome acessível é o texto do botão, e o contorno de foco aparece no botão.
 */
export function BotaoArquivo(p: { rotulo: string; accept: string; capture: boolean; principal: boolean; video?: boolean; aoEscolher: (arquivo: File) => void }) {
  return (
    <label
      className={`flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-center text-base font-semibold has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-destaque ${
        p.principal ? 'bg-texto text-white' : 'border border-borda-campo bg-superficie text-texto'
      }`}
    >
      {p.video ? <IconeVideo /> : <IconeCamera />}
      {p.rotulo}
      <input
        type="file"
        accept={p.accept}
        capture={p.capture ? 'environment' : undefined}
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (arquivo) p.aoEscolher(arquivo);
        }}
      />
    </label>
  );
}

/** Miniatura: a foto ainda no aparelho (object URL) ou a pronta no servidor (link temporário). */
function useMiniatura(estado: EstadoSlot, video: boolean): string | null {
  const arquivo = !video && 'registro' in estado ? estado.registro.arquivo : null;
  const local = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local);
  }, [local]);
  if (local) return local;
  return !video && estado.tipo === 'enviada' ? estado.url : null;
}

type Props = {
  titulo: string;
  descricao: string;
  estado: EstadoSlot;
  video?: boolean;
  aoEscolher: (arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

/** Uma vaga da grade de evidências (spec §6.0): miniatura com ✓ quando enviada, vaga tracejada quando falta. */
export function SlotEvidencia({ titulo, descricao, estado, video = false, aoEscolher, aoTentarDeNovo }: Props) {
  const id = useId();
  const miniatura = useMiniatura(estado, video);
  const borda =
    estado.tipo === 'vazio'
      ? 'border-dashed border-borda-campo'
      : estado.tipo === 'enviada'
        ? 'border-bom'
        : estado.tipo === 'nao_enviada' || estado.tipo === 'falhou'
          ? 'border-erro'
          : 'border-destaque';
  const corTexto = estado.tipo === 'enviada' ? 'text-bom' : estado.tipo === 'nao_enviada' || estado.tipo === 'falhou' ? 'text-erro' : 'text-texto-2';
  const refazer = estado.tipo !== 'vazio';
  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-3 ${borda}`}>
      <div className="flex items-start gap-3">
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element -- link temporário ou object URL: não passa pelo otimizador de imagens
          <img src={miniatura} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-fundo text-texto-2">
            {video ? <IconeVideo /> : <IconeCamera />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p id={`${id}-titulo`} className="text-base font-bold">
            {titulo}
          </p>
          {descricao && <p className="text-sm text-texto-2">{descricao}</p>}
          <p aria-live="polite" className={`mt-1 text-sm font-semibold ${corTexto}`}>
            {estado.tipo === 'enviada' && <span aria-hidden="true">✓ </span>}
            {textoDoSlot(estado)}
          </p>
        </div>
      </div>
      {estado.tipo === 'enviando' && <BarraProgresso valor={estado.progresso} rotulo={`Envio da ${titulo}`} />}
      {estado.tipo === 'aguardando' && <p className={ALERTA_ATENCAO}>{estado.mensagem} O arquivo está guardado no aparelho.</p>}
      {(estado.tipo === 'nao_enviada' || estado.tipo === 'falhou') && (
        <p role="alert" className={ALERTA_ERRO}>
          {estado.mensagem}
        </p>
      )}
      {(estado.tipo === 'nao_enviada' || estado.tipo === 'aguardando') && (
        <button type="button" onClick={() => aoTentarDeNovo(estado.registro.idCliente)} className={BOTAO_SECUNDARIO}>
          Tentar de novo
        </button>
      )}
      {video ? (
        <>
          <BotaoArquivo video rotulo={refazer ? 'Gravar o Vídeo de Prova de novo' : 'Gravar Vídeo de Prova'} accept="video/*" capture principal aoEscolher={aoEscolher} />
          <BotaoArquivo video rotulo="Escolher arquivo de vídeo" accept="video/*" capture={false} principal={false} aoEscolher={aoEscolher} />
        </>
      ) : (
        <BotaoArquivo rotulo={refazer ? `Tirar ${titulo} de novo` : `Tirar ${titulo}`} accept="image/*" capture principal={!refazer} aoEscolher={aoEscolher} />
      )}
    </div>
  );
}
