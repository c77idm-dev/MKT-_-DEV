'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ALERTA_ERRO, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useLeitorCamera } from '@/components/leitor/useLeitorCamera';
import { registrarChegadaAcao, type EstadoRecebimento } from './acoes';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };

type Tom = 'sucesso' | 'aviso' | 'erro';

const ICONES: Record<Tom, string> = {
  sucesso: 'M5 13l4 4L19 7',
  aviso: 'M12 8v5m0 3.5h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z',
  erro: 'M6 6l12 12M18 6L6 18',
};

/** Ícones do resultado: o sentido nunca depende só da cor (texto + ícone + cor). */
function Icone({ tom }: { tom: Tom }) {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={ICONES[tom]} />
    </svg>
  );
}

function LinksDevolucoes({ codigos }: { codigos: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-4">
      {codigos.map((codigo) => (
        <Link key={codigo} href={`/fluxo/devolucoes/${codigo}`} className="inline-flex min-h-11 items-center font-mono font-semibold underline">
          {codigo}
        </Link>
      ))}
    </span>
  );
}

function Cartao({ tom, titulo, children }: { tom: 'sucesso' | 'aviso'; titulo: string; children: ReactNode }) {
  const cores = tom === 'sucesso' ? 'border-bom bg-bom-suave text-bom' : 'border-atencao bg-atencao-suave text-atencao';
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border-2 p-4 ${cores}`}>
      <p className="flex items-center gap-2 text-xl font-bold">
        <Icone tom={tom} />
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** Resposta grande e clara depois de cada leitura. A área fica sempre no DOM para o leitor de tela anunciar (aria-live). */
function Resultado({ estado, acao, pendente }: { estado: EstadoRecebimento; acao: (dados: FormData) => void; pendente: boolean }) {
  return (
    <div role="status" aria-live="polite">
      {(estado.tipo === 'sucesso' || estado.tipo === 'aviso') && (
        <Cartao tom={estado.tipo} titulo={estado.titulo}>
          <p className="text-[15px] font-medium">{estado.mensagem}</p>
          <LinksDevolucoes codigos={estado.codigos} />
        </Cartao>
      )}
      {estado.tipo === 'nao_encontrada' && (
        <Cartao tom="aviso" titulo="Rastreio não encontrado">
          <p className="text-[15px] font-medium">
            Nenhuma devolução com o rastreio <span className="break-all font-mono">{estado.rastreio}</span>.
          </p>
          <form action={acao} className="mt-2">
            <input type="hidden" name="intencao" value="criar_nao_identificada" />
            <input type="hidden" name="rastreio" value={estado.rastreio} />
            <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 w-full`}>
              Registrar pacote não identificado
            </button>
          </form>
        </Cartao>
      )}
      {estado.tipo === 'erro' && (
        <p className={`${ALERTA_ERRO} flex items-center gap-2 text-[15px]`}>
          <Icone tom="erro" />
          {estado.mensagem}
        </p>
      )}
    </div>
  );
}

/**
 * Recebimento (spec §6.2). Mobile-first e para uma mão: a resposta em cima, o campo e os botões grandes embaixo.
 * O campo de texto fica sempre à vista (digitação ou leitor USB, que "digita" e manda Enter).
 * Com a câmera aberta, o vídeo ocupa a tela e o painel com o campo fica embaixo.
 */
export function FormularioRecebimento() {
  const [estado, acao, pendente] = useActionState(registrarChegadaAcao, INICIAL);
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const aoLer = useCallback((codigo: string) => {
    const campo = campoRef.current;
    const formulario = formularioRef.current;
    if (!campo || !formulario) return;
    campo.value = codigo;
    formulario.requestSubmit();
  }, []);
  const { videoRef, situacao, erro: erroCamera, abrir, fechar } = useLeitorCamera(aoLer);
  const cameraAberta = situacao !== 'parada';

  // Foco automático só onde há teclado físico ou leitor USB (ponteiro "fine"). No celular a câmera vem primeiro
  // e o teclado não pode subir por cima dela. Feito em efeito (e não com autoFocus) para não divergir na hidratação.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) campoRef.current?.focus();
  }, []);

  return (
    <div className={cameraAberta ? 'fixed inset-0 z-50 flex h-dvh flex-col bg-black' : 'flex flex-col gap-4'}>
      <div className={cameraAberta ? 'relative min-h-0 flex-1' : 'hidden'}>
        <video ref={videoRef} playsInline muted aria-label="Imagem da câmera" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
        {situacao === 'abrindo' && (
          <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-white">Abrindo a câmera…</p>
        )}
      </div>
      <div
        className={
          cameraAberta
            ? 'flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-superficie px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'flex flex-col gap-4'
        }
      >
        <Resultado estado={estado} acao={acao} pendente={pendente} />
        <form ref={formularioRef} action={acao} className="flex flex-col gap-3">
          <input type="hidden" name="intencao" value="receber" />
          <label htmlFor="rastreio" className={ROTULO}>
            Código de Rastreamento
          </label>
          <input
            ref={campoRef}
            id="rastreio"
            name="rastreio"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={`${CAMPO} h-14 font-mono text-lg`}
          />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {pendente ? 'Registrando…' : 'Registrar chegada'}
          </button>
        </form>
        <button
          type="button"
          onClick={cameraAberta ? fechar : abrir}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold ${
            cameraAberta ? 'border border-borda-forte bg-superficie text-texto' : 'bg-texto text-white'
          }`}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10" />
          </svg>
          {cameraAberta ? 'Fechar câmera' : 'Ler com a câmera'}
        </button>
        {erroCamera && (
          <p role="alert" className={ALERTA_ERRO}>
            {erroCamera}
          </p>
        )}
      </div>
    </div>
  );
}
