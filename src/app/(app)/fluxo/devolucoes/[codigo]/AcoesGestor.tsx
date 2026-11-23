'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { CampoTexto } from '@/components/CampoTexto';
import { CamposItens } from '@/components/CamposItens';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { SelectCanal } from '@/components/SelectCanal';
import {
  ALERTA_ATENCAO,
  ALERTA_ERRO,
  BOTAO_PERIGO,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  CARTAO,
  LINK_VOLTAR,
  ROTULO,
} from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoAcaoGestor } from './acoes';

type Acao = (anterior: EstadoAcaoGestor, dados: FormData) => Promise<EstadoAcaoGestor>;

/** O novo status escolhido e os textos dos botões de cada escolha. */
type NovoStatus = 'CANCELADA' | 'EXTRAVIADA';
const TEXTOS: Record<NovoStatus, { botao: string; confirmar: string }> = {
  CANCELADA: { botao: 'Cancelar devolução', confirmar: 'Sim, cancelar devolução' },
  EXTRAVIADA: { botao: 'Marcar como extraviada', confirmar: 'Sim, marcar como extraviada' },
};
const ID_ERROS_ENCERRAR = 'erros-encerrar';
const ID_ERRO_ESCOLHA = 'erro-escolha-encerrar';

/**
 * Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor.
 * Emenda E24 (23/11): um Gestor cancelou uma devolução sem querer, procurando onde registrar a chegada. Por isso o
 * bloco fica recolhido em "Mais ações do Gestor", nada vem marcado, o botão é vermelho e diz o que faz, e só o
 * 2º toque, na confirmação, envia. O código vem da rota (useParams): o `[codigo]/page.tsx` é congelado (§3).
 */
export function FormularioEncerrar({ acao }: { acao: Acao }) {
  const { codigo } = useParams<{ codigo?: string }>();
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, ID_ERROS_ENCERRAR);
  const [para, setPara] = useState<NovoStatus | null>(null);
  const [semEscolha, setSemEscolha] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const primeiraOpcao = useRef<HTMLInputElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const pergunta = useRef<HTMLParagraphElement>(null);
  const voltou = useRef(false);

  // A confirmação recebe o foco (o leitor de tela lê a pergunta); o "Voltar" devolve o foco ao botão.
  useEffect(() => {
    if (confirmando) {
      pergunta.current?.focus();
    } else if (voltou.current) {
      voltou.current = false;
      botao.current?.focus();
    }
  }, [confirmando]);

  function escolher(novo: NovoStatus) {
    setPara(novo);
    setSemEscolha(false);
    // Trocar a escolha no meio da confirmação volta ao 1º passo: a pergunta precisa falar da escolha nova.
    setConfirmando(false);
  }

  function avisarSemEscolha() {
    setSemEscolha(true);
    primeiraOpcao.current?.focus();
  }

  // O clique vem antes da validação do navegador: sem escolha, o aviso em português aparece primeiro (a escolha fica acima do motivo).
  function aoTocarBotao(evento: MouseEvent<HTMLButtonElement>) {
    if (para) return;
    evento.preventDefault();
    avisarSemEscolha();
  }

  function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    if (!para) {
      evento.preventDefault();
      avisarSemEscolha();
      return;
    }
    if (!confirmando) {
      evento.preventDefault();
      setConfirmando(true);
      return;
    }
    aoEnviar(evento);
  }

  function voltar() {
    voltou.current = true;
    setConfirmando(false);
  }

  const quem = codigo ? `A ${codigo}` : 'A devolução';
  const textoPergunta = `Tem certeza? ${quem} sai da espera de chegada e isso não se desfaz pela tela.`;

  return (
    <details className={CARTAO}>
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-bold">Mais ações do Gestor</summary>
      <form onSubmit={aoSubmeter} aria-labelledby="titulo-encerrar" className="mt-3 flex flex-col gap-3">
        <h2 id="titulo-encerrar" className="text-base font-bold">
          Cancelar ou marcar como extraviada
        </h2>
        <div className="flex flex-col rounded-lg bg-destaque-suave px-3 pt-2 text-sm">
          <p>Isto não registra a chegada. Para registrar a chegada do pacote, use Receber pacote no Fluxo. (extra)</p>
          <Link href="/fluxo/recebimento" className={LINK_VOLTAR}>
            Ir para Receber pacote
          </Link>
        </div>
        <fieldset className="flex flex-col" aria-describedby={semEscolha ? ID_ERRO_ESCOLHA : undefined}>
          <legend className={ROTULO}>Novo status</legend>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              ref={primeiraOpcao}
              type="radio"
              name="para"
              value="CANCELADA"
              checked={para === 'CANCELADA'}
              onChange={() => escolher('CANCELADA')}
              className="size-5"
            />
            Cancelada
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              type="radio"
              name="para"
              value="EXTRAVIADA"
              checked={para === 'EXTRAVIADA'}
              onChange={() => escolher('EXTRAVIADA')}
              className="size-5"
            />
            Extraviada
          </label>
        </fieldset>
        {semEscolha && (
          <p id={ID_ERRO_ESCOLHA} role="alert" className={ALERTA_ERRO}>
            Escolha se a devolução foi cancelada ou extraviada.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="motivo" className={ROTULO}>
            Motivo
          </label>
          <textarea
            id="motivo"
            name="motivo"
            required
            minLength={3}
            maxLength={500}
            rows={3}
            className={`${CAMPO} min-h-24 py-2`}
          />
        </div>
        <ListaErros erros={estado.erros} id={ID_ERROS_ENCERRAR} />
        <RodapeFormulario>
          {confirmando && para ? (
            <div className={`${ALERTA_ATENCAO} flex w-full flex-col gap-2`}>
              <p ref={pergunta} tabIndex={-1} className="text-[15px] outline-none">
                {textoPergunta}
              </p>
              <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
                {pendente ? 'Registrando…' : TEXTOS[para].confirmar}
              </button>
              <button type="button" onClick={voltar} disabled={pendente} className={BOTAO_SECUNDARIO}>
                Voltar
              </button>
            </div>
          ) : (
            <button
              ref={botao}
              type="submit"
              onClick={aoTocarBotao}
              className={para ? `${BOTAO_PERIGO} md:w-auto` : `${BOTAO_SECUNDARIO} w-full md:w-auto`}
            >
              {para ? TEXTOS[para].botao : 'Escolha uma opção'}
            </button>
          )}
        </RodapeFormulario>
      </form>
    </details>
  );
}

/** Spec §5.2: o Gestor liga o pacote não identificado ao pedido certo e a marca sai. */
export function FormularioIdentificar({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-identificar" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-identificar" className="text-base font-bold">
        Identificar devolução
      </h2>
      <p className="text-sm text-texto-2">Ligue este pacote ao pedido certo. A marca &quot;Não identificada&quot; sai.</p>
      <SelectCanal id="identificar-canal" />
      <CampoTexto nome="pedido" id="identificar-pedido" rotulo="Número do pedido (obrigatório)" obrigatorio mono maximo={60} />
      <CampoTexto nome="reclamacao" id="identificar-reclamacao" rotulo="ID da reclamação" mono maximo={60} />
      <CampoTexto nome="transportadora" id="identificar-transportadora" rotulo="Transportadora" maximo={60} />
      <CamposItens iniciais={[]} permitirVazio />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar identificação'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
