'use client';

import { useState } from 'react';
import { FormularioConfirmado } from '@/components/FormularioConfirmado';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { ALERTA_ATENCAO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { PRAZO_APAGADAS_DIAS } from '@/modules/apagadas/dominio';
import type { Perfil } from '@/modules/auth/perfis';
import { pode } from '@/modules/auth/permissoes';
import { correcoesPermitidas, motivoSemTroca, type DadosCorrecao, type UnidadeCorrecao } from '@/modules/devolucoes/correcoes-permitidas';
import { MOTIVOS_ITEM, ROTULO_DESTINO, ROTULO_MOTIVO, ROTULO_STATUS_ITEM, type DestinoItem } from '@/modules/devolucoes/dominio';
import type { EstadoAcaoGestor } from './acoes';
import { FormularioEncerrar } from './AcoesGestor';

type Acao = (anterior: EstadoAcaoGestor, dados: FormData) => Promise<EstadoAcaoGestor>;

/** As ações do servidor, já ligadas (bind) à devolução. Cada uma exige `administrar` no servidor. */
export type AcoesCorrigir = { trocarEstoque: Acao; reabrir: Acao; desfazer: Acao; corrigirDados: Acao; apagar: Acao; encerrar: Acao };

const MOTIVOS_PROBLEMA = MOTIVOS_ITEM.filter((m) => m !== 'AUSENTE');

function situacaoDaUnidade(u: UnidadeCorrecao): string {
  const partes = [
    u.destino ? ROTULO_DESTINO[u.destino] : 'Sem estoque',
    ...(u.destino === 'PROBLEMA' && u.motivo && u.motivo !== 'AUSENTE' ? [ROTULO_MOTIVO[u.motivo]] : []),
    ROTULO_STATUS_ITEM[u.status],
    ...(u.loteCodigo ? [u.loteCodigo] : []),
  ];
  return `Agora: ${partes.join(' · ')}`;
}

function TituloUnidade({ u, id }: { u: UnidadeCorrecao; id?: string }) {
  return (
    <p id={id} className="text-sm font-semibold">
      Unidade {u.unidade} · <span className="break-all font-mono">{u.sku}</span>
    </p>
  );
}

/** Item 1 da E29: Estoque Bom ↔ Estoque Problema de uma unidade. Ir para o Problema pede o motivo (como na conferência). */
export function FormularioTrocarEstoque({ acao, u }: { acao: Acao; u: UnidadeCorrecao }) {
  const idErros = `erros-trocar-${u.id}`;
  const idTitulo = `titulo-unidade-${u.id}`;
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, idErros);
  // Vem marcado o outro estoque: é a troca. Para só mudar o motivo do Problema, escolha Problema de novo.
  const [destino, setDestino] = useState<DestinoItem>(u.destino === 'BOM' ? 'PROBLEMA' : 'BOM');
  return (
    <form onSubmit={aoEnviar} aria-labelledby={idTitulo} className="flex flex-col gap-2 rounded-lg border border-borda p-3">
      <input type="hidden" name="item" value={u.id} />
      <TituloUnidade u={u} id={idTitulo} />
      <p className="text-sm text-texto-2 [overflow-wrap:anywhere]">{situacaoDaUnidade(u)}</p>
      <fieldset disabled={pendente} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`destino-${u.id}`} className={ROTULO}>
            Novo estoque
          </label>
          <select
            id={`destino-${u.id}`}
            name="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value === 'PROBLEMA' ? 'PROBLEMA' : 'BOM')}
            className={CAMPO}
          >
            <option value="BOM">{ROTULO_DESTINO.BOM}</option>
            <option value="PROBLEMA">{ROTULO_DESTINO.PROBLEMA}</option>
          </select>
        </div>
        {destino === 'PROBLEMA' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`motivo-${u.id}`} className={ROTULO}>
              Motivo do Estoque Problema
            </label>
            <select
              id={`motivo-${u.id}`}
              name="motivo"
              required
              defaultValue={u.destino === 'PROBLEMA' && u.motivo !== 'AUSENTE' ? (u.motivo ?? '') : ''}
              className={CAMPO}
            >
              <option value="">Escolha o motivo</option>
              {MOTIVOS_PROBLEMA.map((m) => (
                <option key={m} value={m}>
                  {ROTULO_MOTIVO[m]}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
      <ListaErros erros={estado.erros} id={idErros} />
      <button type="submit" disabled={pendente} className={BOTAO_SECUNDARIO}>
        {pendente ? 'Trocando…' : 'Trocar estoque'}
      </button>
    </form>
  );
}

function SecaoTrocarEstoque({ acao, unidades }: { acao: Acao; unidades: UnidadeCorrecao[] }) {
  return (
    <section aria-labelledby="titulo-trocar-estoque" className="flex flex-col gap-2">
      <h3 id="titulo-trocar-estoque" className="text-base font-bold">
        Trocar estoque
      </h3>
      <p className="text-sm text-texto-2">
        Ir para o Estoque Problema pede o motivo. Depois da NF, a unidade entra no lote Aberto do fornecedor, e voltar ao Estoque Bom a tira do lote.
      </p>
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => {
          const semTroca = motivoSemTroca(u);
          return (
            <li key={u.id}>
              {semTroca ? (
                <div className="flex flex-col gap-1 rounded-lg border border-borda p-3 text-sm">
                  <TituloUnidade u={u} />
                  <p className="text-texto-2 [overflow-wrap:anywhere]">{situacaoDaUnidade(u)}</p>
                  <p>{semTroca}</p>
                </div>
              ) : (
                <FormularioTrocarEstoque acao={acao} u={u} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Item 2 da E29: Aguardando NF → Aguardando conferência. Nada é apagado: um toque basta. */
export function FormularioReabrir({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-reabrir');
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-reabrir" className="flex flex-col gap-2">
      <h3 id="titulo-reabrir" className="text-base font-bold">
        Reabrir a conferência
      </h3>
      <p className="text-sm text-texto-2">
        Volta para Aguardando conferência. Tudo o que foi preenchido fica, e quem abrir a conferência continua de onde estava. A contestação que ainda
        espera o Gestor é descartada e volta no fim da nova conferência.
      </p>
      <ListaErros erros={estado.erros} id="erros-reabrir" />
      <button type="submit" disabled={pendente} className={BOTAO_SECUNDARIO}>
        {pendente ? 'Reabrindo…' : 'Reabrir a conferência'}
      </button>
    </form>
  );
}

/**
 * Item 4 da E29: as observações, o rastreio (só o que não veio do ML) e, por unidade conferida, o produto recebido (pelo
 * SKU do cadastro) e a observação. A unidade num lote não troca de produto (o lote é do fornecedor dele).
 */
export function FormularioCorrigirDados({ acao, dados, editarRastreio }: { acao: Acao; dados: DadosCorrecao; editarRastreio: boolean }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-corrigir-dados');
  const unidades = dados.unidades.filter((u) => u.status !== 'PENDENTE' && u.status !== 'AUSENTE');
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-corrigir-dados" className="flex flex-col gap-3">
      <h3 id="titulo-corrigir-dados" className="text-base font-bold">
        Corrigir dados
      </h3>
      <p className="text-sm text-texto-2">
        O que vem do Mercado Livre não se edita aqui: a sincronização sobrescreveria. O motivo da unidade muda em Trocar estoque; a quantidade, reabrindo a
        conferência e marcando a unidade como ausente.
      </p>
      <fieldset disabled={pendente} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="corrigir-observacoes" className={ROTULO}>
            Observações
          </label>
          <textarea
            id="corrigir-observacoes"
            name="observacoes"
            defaultValue={dados.observacoes ?? ''}
            maxLength={1000}
            rows={3}
            className={`${CAMPO} min-h-24 py-2`}
          />
        </div>
        {editarRastreio ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="corrigir-rastreio" className={ROTULO}>
              Código de rastreamento
            </label>
            <input
              id="corrigir-rastreio"
              name="rastreio"
              defaultValue={dados.rastreio ?? ''}
              maxLength={60}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={`${CAMPO} font-mono`}
            />
          </div>
        ) : (
          <p className="text-sm text-texto-2">O rastreio vem do Mercado Livre: a sincronização o atualiza.</p>
        )}
        {unidades.map((u) => (
          <fieldset key={u.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-borda p-3">
            <legend className="px-1 text-sm font-semibold">
              Unidade {u.unidade} · <span className="break-all font-mono">{u.sku}</span>
            </legend>
            <input type="hidden" name="item" value={u.id} />
            {u.loteCodigo ? (
              <p className="text-sm text-texto-2">No lote {u.loteCodigo}: o produto recebido não muda.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`sku-${u.id}`} className={ROTULO}>
                  SKU do produto recebido
                </label>
                <input
                  id={`sku-${u.id}`}
                  name={`sku-${u.id}`}
                  defaultValue={u.produtoRecebidoSku ?? ''}
                  maxLength={60}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={`${CAMPO} font-mono`}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`obs-${u.id}`} className={ROTULO}>
                Observação da unidade
              </label>
              <input id={`obs-${u.id}`} name={`obs-${u.id}`} defaultValue={u.observacao ?? ''} maxLength={500} className={CAMPO} />
            </div>
          </fieldset>
        ))}
      </fieldset>
      <ListaErros erros={estado.erros} id="erros-corrigir-dados" />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} md:w-auto`}>
          {pendente ? 'Salvando…' : 'Salvar correções'}
        </button>
      </RodapeFormulario>
    </form>
  );
}

/**
 * Corrigir (Gestor) (extra, emenda E29): a seção do detalhe da devolução, só do Gestor, recolhida como o bloco da E24.
 * Cada correção aparece só quando o status deixa (`correcoesPermitidas`); quem decide é o servidor, que recusa com a
 * mensagem do motivo. Cancelar ou extraviar fica por último: é o bloco da E24, o último da página.
 */
export function PainelCorrigir({ codigo, perfil, dados, acoes }: { codigo: string; perfil: Perfil; dados: DadosCorrecao; acoes: AcoesCorrigir }) {
  if (!pode(perfil, 'administrar')) return null;
  const p = correcoesPermitidas(dados);
  return (
    <details id="corrigir" className={`${CARTAO} group`}>
      {/* A seta mostra que o bloco abre (o display flex tira o marcador padrão; no Safari, o -webkit-details-marker). */}
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-bold [&::-webkit-details-marker]:hidden">
        Corrigir (Gestor) (extra)
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 shrink-0 text-texto-2 transition-transform group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3 flex flex-col gap-4 [&>*+*]:border-t [&>*+*]:border-borda [&>*+*]:pt-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-texto-2">Cada correção fica no histórico, com quem, quando e o valor de antes e de depois.</p>
          {p.bloqueio && <p className={ALERTA_ATENCAO}>{p.bloqueio}</p>}
        </div>
        {p.trocarEstoque && <SecaoTrocarEstoque acao={acoes.trocarEstoque} unidades={dados.unidades} />}
        {p.reabrir && <FormularioReabrir acao={acoes.reabrir} />}
        {p.desfazer && (
          <FormularioConfirmado
            acao={acoes.desfazer}
            id="desfazer-chegada"
            titulo="Desfazer a chegada"
            descricao="Para a chegada registrada por engano. A trava da conferência é solta. Não vale para o pacote não identificado: nele, apague."
            botao="Desfazer a chegada"
            pergunta={`Tem certeza? A ${codigo} volta para Pendente de chegada (ou No CD do marketplace, se a chegada veio de lá). Some a chegada (quem e quando), e são descartadas as fotos do pacote, a conferência feita e a contestação que ainda espera o Gestor.`}
            confirmar="Sim, desfazer a chegada"
            enviando="Desfazendo…"
          />
        )}
        <FormularioCorrigirDados acao={acoes.corrigirDados} dados={dados} editarRastreio={p.editarRastreio} />
        {p.apagar && (
          <FormularioConfirmado
            acao={acoes.apagar}
            id="apagar-devolucao"
            titulo="Apagar"
            descricao={`A devolução fica ${PRAZO_APAGADAS_DIAS} dias em Apagadas, de onde o Gestor a restaura. Depois disso é apagada de vez, com as fotos e os vídeos.`}
            botao="Apagar devolução"
            pergunta={`Tem certeza? A ${codigo} sai do quadro, das listas e da busca e vai para Apagadas. A contestação que ainda espera o Gestor sai junto; a já enviada ao ML continua lá.`}
            confirmar="Sim, apagar devolução"
            enviando="Apagando…"
          />
        )}
        {p.encerrar && <FormularioEncerrar acao={acoes.encerrar} status={dados.status} />}
      </div>
    </details>
  );
}
