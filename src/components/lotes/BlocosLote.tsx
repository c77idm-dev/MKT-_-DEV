'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import type { UnidadeLoteVista } from '@/modules/lotes/consultas';
import type { VistaNota } from '@/modules/fiscal/situacao';
import { ROTULO_RESULTADO, ROTULO_TIPO_LOTE, RESULTADOS_FORNECEDOR, TIPOS_LOTE } from '@/modules/lotes/dominio';
import { AtualizarEnquantoProcessa } from '../fiscal/AtualizarEnquantoProcessa';
import { Selo } from '../Selo';
import { BotaoConfirmar } from '../mercado-livre/BotaoConfirmar';
import { RodapeFormulario } from '../RodapeFormulario';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO, VAZIO } from '../estilos';

/**
 * Blocos da tela do lote. Sem estado próprio (decisão 23): o `PainelLote` dá `aoEnviar`, `pendente` (desabilita tudo,
 * pois há um só envio por página) e `ocupado` (esta é a ação que roda: só ela mostra o texto de andamento).
 */
type Envio = { aoEnviar: (evento: FormEvent<HTMLFormElement>) => void; pendente: boolean; ocupado: boolean };

const ID_FORM_MOVER = 'form-mover';

export function BlocoUnidades({
  unidades,
  editavel,
  destinos,
  aoEnviar,
  pendente,
  ocupado,
}: Envio & { unidades: UnidadeLoteVista[]; editavel: boolean; destinos: { valor: string; rotulo: string }[] }) {
  return (
    <section aria-labelledby="titulo-unidades" className="flex flex-col gap-3">
      <h2 id="titulo-unidades" className="text-base font-bold">
        Unidades
      </h2>
      {unidades.length === 0 ? (
        <p className={VAZIO}>Nenhuma unidade neste lote.</p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-2">
          {unidades.map((u) => (
            <li key={u.itemId} className={`${CARTAO} flex flex-col gap-1 p-3`}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{`Unidade ${u.unidade} · ${u.devolucaoCodigo}`}</span>
                <span className="text-xs font-semibold text-texto-2">{u.rotuloStatus}</span>
              </span>
              <span className="break-all font-mono text-[13px] font-semibold">{u.sku}</span>
              <span className="break-words text-sm">{u.descricao}</span>
              <span className="break-all font-mono text-xs text-texto-2">{`S/N ${u.serial}`}</span>
              <span className="text-xs text-texto-2">{`Motivo: ${u.motivo}`}</span>
              {u.observacao && <span className="break-words text-xs text-texto-2">{`Observação: ${u.observacao}`}</span>}
              {u.resultado && <span className="text-sm font-semibold">{`Resultado: ${u.resultado}`}</span>}
              <Link href={`/fluxo/devolucoes/${u.devolucaoCodigo}#conferencia`} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque">
                Ver evidências
                <span className="sr-only">{` da unidade ${u.unidade} da ${u.devolucaoCodigo}`}</span>
              </Link>
              {editavel && (
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                  <input type="checkbox" name="itens" value={u.itemId} form={ID_FORM_MOVER} className="size-5" />
                  {`Mover unidade ${u.unidade} da ${u.devolucaoCodigo}`}
                </label>
              )}
            </li>
          ))}
        </ol>
      )}
      {editavel && unidades.length > 0 && (
        <form id={ID_FORM_MOVER} onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-3`}>
          <input type="hidden" name="operacao" value="mover" />
          <p className="text-sm text-texto-2">Marque as unidades acima e escolha o lote de destino (do mesmo fornecedor).</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="destino-mover" className={ROTULO}>
              Para onde
            </label>
            <select id="destino-mover" name="destino" defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Escolha o destino
              </option>
              <option value="novo">Novo lote</option>
              {destinos.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-novo-mover" className={ROTULO}>
              Tipo do novo lote
            </label>
            <select id="tipo-novo-mover" name="tipoNovo" defaultValue="" className={CAMPO}>
              <option value="">Só para o destino Novo lote</option>
              {TIPOS_LOTE.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_LOTE[t]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto sm:self-start`}>
            {ocupado ? 'Movendo…' : 'Mover unidades'}
          </button>
        </form>
      )}
    </section>
  );
}

export function BlocoFechar({ aoEnviar, pendente, ocupado }: Envio) {
  return (
    <section aria-labelledby="titulo-fechar" className={CARTAO}>
      <form onSubmit={aoEnviar} className="flex flex-col gap-3">
        <h2 id="titulo-fechar" className="text-base font-bold">
          Fechar lote
        </h2>
        <input type="hidden" name="operacao" value="fechar" />
        <fieldset className="flex flex-col gap-1">
          <legend className={ROTULO}>Tipo do lote</legend>
          {TIPOS_LOTE.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="tipo" value={t} className="size-5" />
              {ROTULO_TIPO_LOTE[t]}
            </label>
          ))}
        </fieldset>
        <RodapeFormulario>
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
            {ocupado ? 'Fechando…' : 'Fechar lote'}
          </button>
        </RodapeFormulario>
      </form>
    </section>
  );
}

export function BlocoReabrir({ outroAberto, vazio, aoEnviar, pendente, ocupado }: Envio & { outroAberto: string | null; vazio: boolean }) {
  if (outroAberto) {
    const texto = vazio
      ? `O fornecedor já tem o lote ${outroAberto} aberto, e este lote está vazio.`
      : `O fornecedor já tem o lote ${outroAberto} aberto: mova as unidades deste lote para ele.`;
    return <p className="text-sm text-texto-2">{texto}</p>;
  }
  return (
    <form onSubmit={aoEnviar}>
      <input type="hidden" name="operacao" value="reabrir" />
      <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
        {ocupado ? 'Reabrindo…' : 'Reabrir lote'}
      </button>
    </form>
  );
}

type PropsNotaRemessa = Omit<Envio, 'ocupado'> & {
  /** Operação em andamento ('emitir', 'reenviar', 'cancelar') ou null. */
  operacaoAtual: string | null;
  nota: VistaNota | null;
  anteriores: VistaNota[];
  links: { xml: string; danfe: string } | null;
  status: string;
  podeEmitir: boolean;
  podeReenviar: boolean;
  podeCancelar: boolean;
};

function Dado({ rotulo, children, largo = false, testId }: { rotulo: string; children: string; largo?: boolean; testId?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${largo ? 'sm:col-span-2' : ''}`}>
      <dt className={ROTULO}>{rotulo}</dt>
      <dd data-testid={testId} className="break-all font-mono text-[13px]">
        {children}
      </dd>
    </div>
  );
}

/** Spec §6.4 e §8.6: a NF de Remessa do lote. Emitir é a ação principal do status FECHADO (rodapé fixo). */
export function BlocoNotaRemessa({ nota, anteriores, links, podeEmitir, podeReenviar, podeCancelar, aoEnviar, pendente, operacaoAtual }: PropsNotaRemessa) {
  return (
    <section aria-labelledby="titulo-nf-remessa" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-nf-remessa" className="text-base font-bold">
        NF de Remessa
      </h2>
      {nota ? (
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap gap-1.5">
            <Selo texto={nota.selo} tom={nota.tom} />
            {nota.homologacao && <Selo texto="Homologação (sem valor fiscal)" tom="atencao" />}
          </span>
          {nota.situacao === 'PROCESSANDO' && <AtualizarEnquantoProcessa />}
          {nota.situacao === 'REJEITADA' && (
            <>
              <p className="text-sm">
                <span className="font-semibold">Motivo:</span> {nota.motivoRejeicao ?? '—'}
              </p>
              <p className="text-sm text-texto-2">Corrija a causa (regras e dados da empresa em Configurações › Fiscal) e reenvie.</p>
            </>
          )}
          {nota.situacao === 'AUTORIZADA' && (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Dado rotulo="Número">{nota.numero ?? '—'}</Dado>
              <Dado rotulo="Série">{nota.serie ?? '—'}</Dado>
              <Dado rotulo="Chave de acesso" largo testId="chave-nf-remessa">
                {nota.chave ?? '—'}
              </Dado>
            </dl>
          )}
          {nota.avisoSerie && <p className={ALERTA_ATENCAO}>{nota.avisoSerie}</p>}
          {links && (
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <a href={links.danfe} target="_blank" rel="noopener noreferrer" className={BOTAO_SECUNDARIO}>
                Abrir DANFE (PDF)
              </a>
              <a href={links.xml} download className={BOTAO_SECUNDARIO}>
                Baixar XML
              </a>
            </div>
          )}
          {nota.prazoEncerrado && (
            <p className="text-sm text-texto-2">{`O prazo de cancelamento (24 h) terminou em ${nota.cancelavelAte}. Para desfazer, fale com o contador sobre a nota de estorno.`}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-texto-2">Nenhuma NF de Remessa emitida.</p>
      )}
      {podeEmitir && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="emitir" />
          <RodapeFormulario>
            <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
              {operacaoAtual === 'emitir' ? 'Enviando…' : 'Emitir NF de Remessa'}
            </button>
          </RodapeFormulario>
        </form>
      )}
      {podeReenviar && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="reenviar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}>
            {operacaoAtual === 'reenviar' ? 'Reenviando…' : 'Corrigir e reenviar'}
          </button>
        </form>
      )}
      {podeCancelar && nota && (
        <details className="rounded-lg border border-borda px-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-erro">Cancelar esta NF</summary>
          <form onSubmit={aoEnviar} className="flex flex-col gap-3 pb-3">
            <input type="hidden" name="operacao" value="cancelar" />
            <p className="text-sm text-texto-2">{`Pode cancelar até ${nota.cancelavelAte}. O lote volta para Fechado.`}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="justificativa-remessa" className={ROTULO}>
                Justificativa (15 a 255 caracteres)
              </label>
              <textarea id="justificativa-remessa" name="justificativa" required minLength={15} maxLength={255} rows={3} className={`${CAMPO} min-h-24 py-2`} />
            </div>
            <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
              {operacaoAtual === 'cancelar' ? 'Cancelando…' : 'Cancelar NF'}
            </button>
          </form>
        </details>
      )}
      {anteriores.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className={ROTULO}>NF canceladas</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {anteriores.map((a) => (
              <li key={a.id}>{`NF ${a.numero ?? '—'} (série ${a.serie ?? '—'}), cancelada em ${a.canceladaEm ?? '—'}${a.justificativa ? `: ${a.justificativa}` : ''}`}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Spec §6.5: lista consolidada em PDF e Excel, para o SAC do fabricante. */
export function BlocoListaConsolidada({ codigo }: { codigo: string }) {
  const base = `/api/lotes/${codigo}/lista-consolidada`;
  return (
    <section aria-labelledby="titulo-lista" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-lista" className="text-base font-bold">
        Lista consolidada
      </h2>
      <p className="text-sm text-texto-2">Para enviar ao SAC do fabricante.</p>
      <div className="grid grid-cols-1 gap-2 sm:flex">
        <a href={`${base}?formato=pdf`} download className={BOTAO_SECUNDARIO}>
          Baixar PDF
        </a>
        <a href={`${base}?formato=xlsx`} download className={BOTAO_SECUNDARIO}>
          Baixar Excel
        </a>
      </div>
    </section>
  );
}

export function BlocoEnvio({ aoEnviar, pendente, ocupado }: Envio) {
  return (
    <section aria-labelledby="titulo-envio" className={CARTAO}>
      <form onSubmit={aoEnviar} className="flex flex-col gap-3">
        <h2 id="titulo-envio" className="text-base font-bold">
          Registrar envio
        </h2>
        <input type="hidden" name="operacao" value="envio" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rastreio-envio" className={ROTULO}>
            Código de rastreamento do envio
          </label>
          <input id="rastreio-envio" name="rastreio" type="text" required maxLength={60} autoCapitalize="characters" autoComplete="off" className={CAMPO} />
        </div>
        <RodapeFormulario>
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
            {ocupado ? 'Registrando…' : 'Registrar envio'}
          </button>
        </RodapeFormulario>
      </form>
    </section>
  );
}

export function BlocoResultado({ unidades, aoEnviar, pendente, ocupado }: Envio & { unidades: UnidadeLoteVista[] }) {
  const enviadas = unidades.filter((u) => u.status === 'ENVIADO');
  return (
    <section aria-labelledby="titulo-resultado" className={CARTAO}>
      <form onSubmit={aoEnviar} className="flex flex-col gap-3">
        <h2 id="titulo-resultado" className="text-base font-bold">
          Registrar resultado
        </h2>
        <input type="hidden" name="operacao" value="resultado" />
        {enviadas.map((u) => (
          <div key={u.itemId} className="flex flex-col gap-1.5">
            <label htmlFor={`resultado-${u.itemId}`} className={ROTULO}>
              {`Resultado do fornecedor (unidade ${u.unidade} da ${u.devolucaoCodigo})`}
            </label>
            <select id={`resultado-${u.itemId}`} name={`resultado-${u.itemId}`} defaultValue="" className={CAMPO}>
              <option value="">Escolha</option>
              {RESULTADOS_FORNECEDOR.map((r) => (
                <option key={r} value={r}>
                  {ROTULO_RESULTADO[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="text-sm text-texto-2">O resultado é definitivo.</p>
        <RodapeFormulario>
          <BotaoConfirmar
            rotulo="Registrar resultado"
            rotuloConfirmar="Toque de novo: o resultado é definitivo"
            pendente={ocupado}
            rotuloPendente="Registrando…"
            desabilitado={pendente}
            className={`${BOTAO_PRIMARIO} w-full md:w-auto`}
          />
        </RodapeFormulario>
      </form>
    </section>
  );
}
