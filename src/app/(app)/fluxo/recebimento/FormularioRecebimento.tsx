'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FotosPacote } from '@/components/conferencia/FotosPacote';
import { ALERTA_ERRO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useManterFilaAtiva } from '@/components/midia/useFilaEnvios';
import { useLeitorCamera } from '@/components/leitor/useLeitorCamera';
import { useTravaToqueDuplo } from '@/components/venda/useTravaToqueDuplo';
import { BotaoConferir } from '../conferencia/BotaoConferir';
import { criarRetiradaAcao, type EstadoNovaRetirada } from '../retiradas-full/acoes';
import { registrarChegadaAcao, type EstadoRecebimento } from './acoes';
import { EscolhaDoPedido, instrucaoDaEscolha, TITULO_ESCOLHA } from './EscolhaDoPedido';
import { cartaoDescartado, podeAceitarLeitura } from './guarda';
import { avisoAindaEsperam, mensagemComNota } from './mensagens';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };
const SEM_ERRO_RETIRADA: EstadoNovaRetirada = { erro: null };

/** (E29) Os dois botões de "De onde veio este pacote?": do mesmo tamanho e do mesmo jeito, para nenhum parecer o certo. */
const BOTAO_ORIGEM =
  'flex h-full min-h-20 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-borda-campo bg-superficie px-4 py-3 text-center text-texto hover:border-destaque disabled:opacity-60';

/** O texto de um botão de origem: o nome do botão é o rótulo; a dica fica na descrição (lida depois do nome). */
function useConteudoOrigem({ rotulo, dica }: { rotulo: string; dica: string }) {
  const id = useId();
  const ids = { rotulo: `${id}-rotulo`, dica: `${id}-dica` };
  const conteudo = (
    <>
      <span id={ids.rotulo} className="text-base font-bold">
        {rotulo}
      </span>
      <span id={ids.dica} className="text-sm text-texto-2">
        {dica}
      </span>
    </>
  );
  return { ...ids, conteudo };
}

/**
 * Melhoria 3 e (E29) "Do armazém do ML (Full)": o pacote é uma retirada do Full (mercadoria da empresa voltando do
 * armazém do ML). Abre a retirada com o código lido como etiqueta, sem criar devolução.
 */
function BotaoRetiradaFull({ rastreio, desabilitado }: { rastreio: string; desabilitado: boolean }) {
  const [estado, acao, pendente] = useActionState(criarRetiradaAcao, SEM_ERRO_RETIRADA);
  const cedoDemais = useTravaToqueDuplo();
  const erroRef = useRef<HTMLParagraphElement>(null);
  const { rotulo, dica, conteudo } = useConteudoOrigem({ rotulo: 'Do armazém do ML (Full)', dica: "remetente MELI e 'Ret. ID' na etiqueta" });
  useEffect(() => {
    if (estado.erro) erroRef.current?.focus();
  }, [estado]);
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (cedoDemais()) evento.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="codigoEtiqueta" value={rastreio} />
      <button type="submit" disabled={desabilitado || pendente} aria-labelledby={rotulo} aria-describedby={dica} className={BOTAO_ORIGEM}>
        {conteudo}
      </button>
      {estado.erro && (
        <p ref={erroRef} tabIndex={-1} role="alert" className={ALERTA_ERRO}>
          {estado.erro}
        </p>
      )}
    </form>
  );
}

/** (E29) "De cliente, sem cadastro": registra a não identificada, como o Recebimento já fazia; o Gestor liga ao pedido depois. */
function BotaoNaoIdentificada({ rastreio, acao, pendente }: { rastreio: string; acao: (dados: FormData) => void; pendente: boolean }) {
  const cedoDemais = useTravaToqueDuplo();
  const { rotulo, dica, conteudo } = useConteudoOrigem({ rotulo: 'De cliente, sem cadastro', dica: 'vira não identificada e o Gestor liga depois' });
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (cedoDemais()) evento.preventDefault();
      }}
    >
      <input type="hidden" name="intencao" value="criar_nao_identificada" />
      <input type="hidden" name="rastreio" value={rastreio} />
      <button type="submit" disabled={pendente} aria-labelledby={rotulo} aria-describedby={dica} className={BOTAO_ORIGEM}>
        {conteudo}
      </button>
    </form>
  );
}

export const TITULO_DE_ONDE_VEIO = 'De onde veio este pacote?';

/**
 * (E29) Código que não é de nenhuma devolução: a pessoa diz de onde o pacote veio, com dois botões do mesmo tamanho. O
 * sistema não descobre sozinho: o envio da retirada do Full não é das contas do vendedor (404 do ML no teste de 27/11)
 * e o código tem o mesmo formato de um envio de devolução; como toda devolução do ML está no sistema, quase sempre é
 * Full. Os dois botões só valem 0,7 s depois de a pergunta aparecer: ela empurra o "Registrar chegada" para baixo.
 */
function DeOndeVeio({ rastreio, acao, pendente }: { rastreio: string; acao: (dados: FormData) => void; pendente: boolean }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid="de-onde-veio" className="flex flex-col gap-3 rounded-2xl border-2 border-atencao bg-atencao-suave p-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="flex items-center gap-2 text-xl font-bold text-atencao">
          <Icone tom="aviso" />
          {TITULO_DE_ONDE_VEIO}
        </h2>
        <p className="text-[15px] font-medium text-atencao">
          Nenhuma devolução com o código <span className="break-all font-mono">{rastreio}</span>.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <BotaoRetiradaFull rastreio={rastreio} desabilitado={pendente} />
        <BotaoNaoIdentificada rastreio={rastreio} acao={acao} pendente={pendente} />
      </div>
    </section>
  );
}

type Tom = 'sucesso' | 'aviso' | 'erro';

const ICONES: Record<Tom, string> = {
  sucesso: 'M5 13l4 4L19 7',
  aviso: 'M12 8v5m0 3.5h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z',
  erro: 'M6 6l12 12M18 6L6 18',
};

/** Ícones do resultado: o sentido nunca depende só da cor (texto + ícone + cor). */
function Icone({ tom, tamanho = 28 }: { tom: Tom; tamanho?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
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

/**
 * Cartão grande do resultado. O texto visível fica escondido do leitor de tela porque a região aria-live (acima) já o anuncia.
 * `nota` (extra, E25): por qual número da etiqueta do ML a devolução foi achada.
 * `aviso` (extra, E27): no cartão verde (e, 24/11, no amarelo "Este pacote já chegou"), as outras devoluções do mesmo
 * pedido que ainda esperam o pacote, em destaque.
 */
function Cartao({
  tom,
  titulo,
  mensagem,
  nota,
  aviso,
  children,
}: {
  tom: Tom;
  titulo: string;
  mensagem: ReactNode;
  nota?: string;
  aviso?: string;
  children?: ReactNode;
}) {
  const cores =
    tom === 'sucesso' ? 'border-bom bg-bom-suave text-bom' : tom === 'aviso' ? 'border-atencao bg-atencao-suave text-atencao' : 'border-erro bg-erro-suave text-erro';
  return (
    <div data-testid="cartao-resultado" className={`flex flex-col gap-1 rounded-2xl border-2 p-4 ${cores}`}>
      <p aria-hidden="true" className="flex items-center gap-2 text-xl font-bold">
        <Icone tom={tom} />
        {titulo}
      </p>
      <p aria-hidden="true" className="text-[15px] font-medium">
        {mensagem}
      </p>
      {nota && (
        <p aria-hidden="true" className="text-sm font-semibold">
          {nota}
        </p>
      )}
      {aviso && (
        <p
          aria-hidden="true"
          data-testid="aviso-ainda-esperam"
          className="my-1 flex gap-2 rounded-xl border-2 border-atencao bg-atencao-suave p-3 text-[15px] font-semibold text-atencao"
        >
          <Icone tom="aviso" tamanho={22} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{aviso}</span>
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * (extra, E27) O aviso das devoluções do mesmo pedido que ainda esperam o pacote, só no cartão que o tem: o verde e
 * (24/11) o amarelo "Este pacote já chegou".
 */
function avisoDoCartao(estado: EstadoRecebimento): string | undefined {
  return (estado.tipo === 'sucesso' || estado.tipo === 'aviso') && estado.aindaEsperam?.length ? avisoAindaEsperam(estado.aindaEsperam) : undefined;
}

function textoAnunciado(estado: EstadoRecebimento): string {
  switch (estado.tipo) {
    case 'sucesso':
    case 'aviso': {
      // (E27) O aviso das que ainda esperam entra no anúncio: o texto muda e o leitor de tela anuncia de novo.
      const texto = `${estado.titulo}. ${mensagemComNota(estado.mensagem, estado.nota)}`;
      const aviso = avisoDoCartao(estado);
      return aviso ? mensagemComNota(texto, aviso) : texto;
    }
    case 'escolher':
      return `${TITULO_ESCOLHA}. ${estado.nota} ${instrucaoDaEscolha(estado.fichas.length)}`;
    case 'nao_encontrada':
      return `${TITULO_DE_ONDE_VEIO} Nenhuma devolução com o código ${estado.rastreio}.`;
    case 'erro':
      return estado.mensagem;
    default:
      return '';
  }
}

/** Cada resposta do servidor é um objeto novo: um número por resposta, para remontar os botões (a trava do toque duplo recomeça). */
const NUMEROS_DAS_RESPOSTAS = new WeakMap<EstadoRecebimento, number>();
let ultimaResposta = 0;
function numeroDaResposta(estado: EstadoRecebimento): number {
  let n = NUMEROS_DAS_RESPOSTAS.get(estado);
  if (n === undefined) {
    ultimaResposta += 1;
    n = ultimaResposta;
    NUMEROS_DAS_RESPOSTAS.set(estado, n);
  }
  return n;
}

const BOTAO_CONFERIR = `${BOTAO_PRIMARIO} min-h-14 w-full text-lg`;

/**
 * (E29) Os dois botões do cartão verde, na Bancada:
 * - "Conferir agora" abre a conferência da devolução que chegou, travada com quem tocou. Se a chegada registrou mais de
 *   uma devolução, cada código tem o seu "Conferir". A não identificada não tem: o Gestor liga ao pedido antes;
 * - "Próximo pacote" limpa a tela e volta ao campo (no celular, à câmera).
 * Os dois só valem 0,7 s depois de o cartão aparecer (ele empurra o "Registrar chegada" para baixo).
 */
function AcoesDaChegada({ codigos, naoIdentificada, aoProximo }: { codigos: string[]; naoIdentificada: boolean; aoProximo: () => void }) {
  const cedoDemais = useTravaToqueDuplo();
  return (
    <div className="mt-2 flex flex-col gap-2">
      {!naoIdentificada &&
        codigos.map((codigo) => (
          <BotaoConferir key={codigo} codigo={codigo} className={BOTAO_CONFERIR}>
            {codigos.length > 1 ? `Conferir ${codigo}` : 'Conferir agora'}
          </BotaoConferir>
        ))}
      <button
        type="button"
        onClick={() => {
          if (!cedoDemais()) aoProximo();
        }}
        className={`${BOTAO_SECUNDARIO} min-h-14 w-full text-lg`}
      >
        Próximo pacote
      </button>
    </div>
  );
}

/**
 * Resposta grande e clara depois de cada leitura. A região aria-live fica sempre no DOM e leva só o título e a
 * mensagem; links e botões ficam fora dela, para o leitor de tela não repetir controles.
 */
function Resultado({
  estado,
  acao,
  pendente,
  aoProximo,
}: {
  estado: EstadoRecebimento;
  acao: (dados: FormData) => void;
  pendente: boolean;
  aoProximo: () => void;
}) {
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {textoAnunciado(estado)}
      </div>
      {(estado.tipo === 'sucesso' || estado.tipo === 'aviso') && (
        <Cartao tom={estado.tipo} titulo={estado.titulo} mensagem={estado.mensagem} nota={estado.nota} aviso={avisoDoCartao(estado)}>
          <LinksDevolucoes codigos={estado.codigos} />
          {estado.tipo === 'sucesso' && (
            <AcoesDaChegada
              key={numeroDaResposta(estado)}
              codigos={estado.codigos}
              naoIdentificada={Boolean(estado.naoIdentificada)}
              aoProximo={aoProximo}
            />
          )}
        </Cartao>
      )}
      {/* (extra, E27) Pelo número do pedido: a ficha (ou a lista) e "Dar chegada". Remonta a cada leitura (trava do toque duplo). */}
      {estado.tipo === 'escolher' && <EscolhaDoPedido key={estado.lidaEm} estado={estado} acao={acao} pendente={pendente} />}
      {/* (E29) Código desconhecido: "De onde veio este pacote?". Remonta a cada leitura (trava do toque duplo). */}
      {estado.tipo === 'nao_encontrada' && <DeOndeVeio key={numeroDaResposta(estado)} rastreio={estado.rastreio} acao={acao} pendente={pendente} />}
      {estado.tipo === 'erro' && <Cartao tom="erro" titulo="Não foi possível registrar" mensagem={estado.mensagem} />}
    </>
  );
}

/** Teclado físico ou leitor USB (ponteiro "fine"): o campo recebe o foco. No toque, a câmera vem primeiro. */
function temPonteiroFino(): boolean {
  return window.matchMedia('(pointer: fine)').matches;
}

/**
 * Recebimento (spec §6.2), dentro da Bancada (E29). Mobile-first e para uma mão: a resposta em cima, o campo e os botões
 * grandes embaixo. Começa pelo botão grande "Chegou um pacote", que abre o campo (digitação ou leitor USB, que "digita"
 * e manda Enter) e, no celular, a câmera. Com a câmera aberta, o vídeo ocupa a tela e o painel com o campo fica embaixo.
 */
export function FormularioRecebimento() {
  // As Fotos 1 e 2 do pacote anterior continuam subindo depois de outro código ser registrado (o FotosPacote desmonta).
  useManterFilaAtiva();
  const [estado, acao, pendente] = useActionState(registrarChegadaAcao, INICIAL);
  // (E29) O botão grande "Chegou um pacote" abre o Recebimento; depois ele fica aberto.
  const [aberto, setAberto] = useState(false);
  // (E29) O cartão verde que o "Próximo pacote" tirou da tela. O estado da ação continua com ele: o servidor ainda compara
  // a próxima leitura da câmera com ele (cartaoDescartado, em guarda.ts).
  const [descartado, setDescartado] = useState<EstadoRecebimento | null>(null);
  const visivel = cartaoDescartado(descartado, estado) ? INICIAL : estado;
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  // (extra, E25) Botão escondido que a câmera usa para mandar o formulário com `origem=camera` (ver mesmaLeituraDaCamera).
  const envioCameraRef = useRef<HTMLButtonElement>(null);
  // Última situação do envio, lida pelo callback da câmera (que não é recriado a cada renderização).
  const situacaoEnvioRef = useRef({ pendente, estado });
  useEffect(() => {
    situacaoEnvioRef.current = { pendente, estado };
  }, [pendente, estado]);
  const aoLer = useCallback((codigo: string) => {
    const campo = campoRef.current;
    const formulario = formularioRef.current;
    if (!campo || !formulario) return;
    if (!podeAceitarLeitura(situacaoEnvioRef.current.pendente, situacaoEnvioRef.current.estado)) return;
    // Marca já como pendente: uma segunda leitura antes da próxima renderização também é ignorada.
    situacaoEnvioRef.current = { pendente: true, estado: situacaoEnvioRef.current.estado };
    campo.value = codigo;
    formulario.requestSubmit(envioCameraRef.current);
  }, []);
  const { videoRef, situacao, erro: erroCamera, abrir, fechar } = useLeitorCamera(aoLer);
  const cameraAberta = situacao !== 'parada';
  const botaoCameraRef = useRef<HTMLButtonElement>(null);
  const primeiraRenderRef = useRef(true);
  // Foco: ao abrir a câmera vai para "Fechar câmera"; ao fechar, volta para "Ler com a câmera" (o botão é remontado em outro lugar).
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false;
      return;
    }
    botaoCameraRef.current?.focus();
  }, [cameraAberta]);

  // Foco automático só onde há teclado físico ou leitor USB (ponteiro "fine"), quando o campo aparece. No celular a câmera
  // vem primeiro e o teclado não pode subir por cima dela. Feito em efeito (e não com autoFocus) para não divergir na hidratação.
  useEffect(() => {
    if (aberto && temPonteiroFino()) campoRef.current?.focus();
  }, [aberto]);
  // Depois de cada resposta, o computador volta o foco ao campo (próximo pacote); no toque não abre o teclado.
  useEffect(() => {
    if (estado.tipo !== 'inicial' && temPonteiroFino()) campoRef.current?.focus();
  }, [estado]);

  // (E29) No toque, a câmera abre no próprio gesto (o navegador exige um toque para abri-la).
  const comecar = () => {
    if (!temPonteiroFino() && !cameraAberta) void abrir();
  };
  const chegouUmPacote = () => {
    setAberto(true);
    comecar();
  };
  const proximoPacote = () => {
    setDescartado(estado);
    const campo = campoRef.current;
    if (campo) campo.value = '';
    if (temPonteiroFino()) campo?.focus();
    comecar();
  };

  // Com a câmera aberta o botão fica fixo no topo do painel (sticky), mesmo com um cartão alto; fechada, vai depois do formulário.
  const botaoCamera = (
    <button
      ref={botaoCameraRef}
      type="button"
      onClick={cameraAberta ? fechar : abrir}
      className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold ${
        cameraAberta ? 'sticky top-0 z-10 mt-4 border border-borda-campo bg-superficie text-texto' : 'bg-texto text-white'
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
  );

  return (
    <div
      role={cameraAberta ? 'dialog' : undefined}
      aria-modal={cameraAberta ? true : undefined}
      aria-label={cameraAberta ? 'Leitor de código pela câmera' : undefined}
      className={cameraAberta ? 'fixed inset-0 z-50 flex h-dvh flex-col bg-black' : 'flex flex-col gap-4'}
    >
      <div className={cameraAberta ? 'relative min-h-0 flex-1' : 'hidden'}>
        <video ref={videoRef} playsInline muted aria-label="Imagem da câmera" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
        {situacao === 'abrindo' && <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-white">Abrindo a câmera…</p>}
      </div>
      <div
        className={
          cameraAberta
            ? 'flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-superficie px-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'flex flex-col gap-4'
        }
      >
        {cameraAberta && botaoCamera}
        {!aberto && (
          // (E29) A Bancada começa por aqui: um botão só, grande, para o pacote que chegou.
          <button
            type="button"
            onClick={chegouUmPacote}
            className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl bg-destaque px-5 text-2xl font-bold text-white hover:bg-destaque-escuro"
          >
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
              <path d="M3.3 7L12 12l8.7-5M12 22V12" />
            </svg>
            Chegou um pacote
          </button>
        )}
        {aberto && <Resultado estado={visivel} acao={acao} pendente={pendente} aoProximo={proximoPacote} />}
        {visivel.tipo === 'sucesso' && visivel.naoIdentificada && !cameraAberta && (
          <FotosPacote key={visivel.naoIdentificada.id} devolucaoId={visivel.naoIdentificada.id} />
        )}
        {aberto && (
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
            {/* Depois do botão visível, que continua sendo o do Enter (leitor USB). */}
            <button ref={envioCameraRef} type="submit" name="origem" value="camera" hidden tabIndex={-1} />
          </form>
        )}
        {aberto && !cameraAberta && botaoCamera}
        {erroCamera && (
          <p role="alert" className={ALERTA_ERRO}>
            {erroCamera}
          </p>
        )}
      </div>
    </div>
  );
}
