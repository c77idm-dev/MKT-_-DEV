'use client';

import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { OpcaoItemVenda, VistaNota, VistaNotaVenda, VistaUnidade } from '@/modules/fiscal/situacao';
import { AtualizarEnquantoProcessa } from './AtualizarEnquantoProcessa';
import { ESTADO_INICIAL_FISCAL, type EstadoAcaoFiscal } from './tipos';

type Acao = (anterior: EstadoAcaoFiscal, dados: FormData) => Promise<EstadoAcaoFiscal>;

const TITULO = 'text-sm font-bold';
const LARGURA = 'w-full sm:w-auto';
const CAIXA = 'flex flex-col gap-2 rounded-lg border border-borda p-3';

/** Mensagem do bloco: fica mesmo quando o botão que a gerou some (ex.: "Emitir" vira "NF em processamento"). */
function Retorno({ estado, idErros }: { estado: EstadoAcaoFiscal; idErros: string }) {
  return (
    <>
      {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
      <ListaErros erros={estado.erros} id={idErros} />
    </>
  );
}

function Dado({ rotulo, children, largo = false, mono = false, testId }: { rotulo: string; children: string; largo?: boolean; mono?: boolean; testId?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${largo ? 'sm:col-span-2' : ''}`}>
      <dt className={ROTULO}>{rotulo}</dt>
      <dd data-testid={testId} className={mono ? 'break-all font-mono text-[13px]' : 'text-[15px]'}>
        {children}
      </dd>
    </div>
  );
}

type PropsNotaDevolucao = {
  acao: Acao;
  nota: VistaNota | null;
  anteriores: VistaNota[];
  links: { xml: string; danfe: string } | null;
  podeEmitir: boolean;
  podeReenviar: boolean;
  podeCancelar: boolean;
};

/** Spec §6.4 e §8.6: a NF de devolução (situação, dados, XML, DANFE), emitir, corrigir e reenviar, cancelar. */
export function BlocoNotaDevolucao({ acao, nota, anteriores, links, podeEmitir, podeReenviar, podeCancelar }: PropsNotaDevolucao) {
  const idErros = 'erros-nf-devolucao';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>NF de devolução</h3>
      <Retorno estado={estado} idErros={idErros} />
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
              <p className="text-sm text-texto-2">
                Corrija a causa (regras e dados da empresa em Configurações › Fiscal, ou a NF de venda abaixo) e reenvie.
              </p>
            </>
          )}
          {nota.situacao === 'AUTORIZADA' && (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Dado rotulo="Número" mono>
                {nota.numero ?? '—'}
              </Dado>
              <Dado rotulo="Série" mono>
                {nota.serie ?? '—'}
              </Dado>
              <Dado rotulo="Chave de acesso" mono largo testId="chave-nf-devolucao">
                {nota.chave ?? '—'}
              </Dado>
              <Dado rotulo="Autorizada em">{nota.autorizadaEm ?? '—'}</Dado>
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
        <p className="text-sm text-texto-2">Nenhuma NF de devolução emitida.</p>
      )}
      {podeEmitir && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="emitir" />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} ${LARGURA}`}>
            {pendente ? 'Enviando…' : 'Emitir NF de devolução'}
          </button>
        </form>
      )}
      {podeReenviar && nota && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="reenviar" />
          <input type="hidden" name="nota" value={nota.id} />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} ${LARGURA}`}>
            {pendente ? 'Reenviando…' : 'Corrigir e reenviar'}
          </button>
        </form>
      )}
      {podeCancelar && nota && (
        <details className="rounded-lg border border-borda px-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-erro">Cancelar esta NF</summary>
          <form onSubmit={aoEnviar} className="flex flex-col gap-3 pb-3">
            <input type="hidden" name="operacao" value="cancelar" />
            <input type="hidden" name="nota" value={nota.id} />
            <p className="text-sm text-texto-2">{`Pode cancelar até ${nota.cancelavelAte}. Os itens e a devolução voltam para Aguardando NF.`}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="justificativa-cancelamento" className={ROTULO}>
                Justificativa (15 a 255 caracteres)
              </label>
              <textarea
                id="justificativa-cancelamento"
                name="justificativa"
                required
                minLength={15}
                maxLength={255}
                rows={3}
                className={`${CAMPO} min-h-24 py-2`}
              />
            </div>
            <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
              {pendente ? 'Cancelando…' : 'Cancelar NF'}
            </button>
          </form>
        </details>
      )}
      {anteriores.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className={ROTULO}>NF canceladas</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {anteriores.map((a) => (
              <li key={a.id}>{`NF ${a.numero ?? '—'} (série ${a.serie ?? '—'}), cancelada em ${a.canceladaEm ?? '—'}${a.justificativa ? `: ${a.justificativa}` : ''}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type PropsNotaVenda = { acao: Acao; notas: VistaNotaVenda[]; podeAnexar: boolean; podeBuscarMl: boolean; podeRemover: boolean };

/** Spec §7.5: a NF de venda (do Mercado Livre ou anexada pelo Fiscal). */
export function BlocoNotaVenda({ acao, notas, podeAnexar, podeBuscarMl, podeRemover }: PropsNotaVenda) {
  const idErros = 'erros-nf-venda';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>NF de venda</h3>
      <Retorno estado={estado} idErros={idErros} />
      {notas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhuma NF de venda. Ela dá o destinatário, os valores e a chave referenciada da NF de devolução.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notas.map((n) => (
            <li key={n.id} className={CAIXA}>
              <span className="text-xs font-semibold text-texto-2">{`${n.origem}${n.emitidaEm ? ` · emitida em ${n.emitidaEm}` : ''} · destinatário em ${n.uf}`}</span>
              <span className="break-all font-mono text-[13px]">{n.chave}</span>
              <span className="text-sm">{n.itens.join(' · ')}</span>
              {podeRemover && (
                <form onSubmit={aoEnviar}>
                  <input type="hidden" name="operacao" value="remover" />
                  <input type="hidden" name="notaVenda" value={n.id} />
                  <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
                    Remover<span className="sr-only">{` a NF de venda com chave final ${n.chave.slice(-8)}`}</span>
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeBuscarMl && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="buscar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
            {pendente ? 'Buscando…' : 'Buscar no Mercado Livre'}
          </button>
        </form>
      )}
      {podeAnexar && (
        <form onSubmit={aoEnviar} className="flex flex-col gap-2">
          <input type="hidden" name="operacao" value="anexar" />
          <label htmlFor="xml-venda" className={ROTULO}>
            Arquivo XML da NF de venda
          </label>
          <input
            id="xml-venda"
            name="xml"
            type="file"
            required
            accept=".xml,text/xml,application/xml"
            aria-describedby="xml-venda-dica"
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-borda-campo file:bg-superficie file:px-4 file:font-semibold"
          />
          <p id="xml-venda-dica" className="text-xs text-texto-2">
            O XML autorizado (com o protocolo da SEFAZ), baixado do Bitbrain. Até 1 MB.
          </p>
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
            {pendente ? 'Anexando…' : 'Anexar XML'}
          </button>
        </form>
      )}
    </div>
  );
}

type PropsItensVenda = { acao: Acao; unidades: VistaUnidade[]; opcoes: OpcaoItemVenda[]; podeEscolher: boolean };

/** D14: cada unidade entra na NF de devolução com um item da NF de venda (SKU, depois EAN; senão, o Fiscal escolhe). */
export function BlocoItensVenda({ acao, unidades, opcoes, podeEscolher }: PropsItensVenda) {
  const idErros = 'erros-itens-venda';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>Itens e NF de venda</h3>
      <p className="text-sm text-texto-2">
        Cada unidade entra na NF de devolução com um item da NF de venda: pelo SKU, depois pelo EAN. Se nada casar, escolha o item.
      </p>
      <Retorno estado={estado} idErros={idErros} />
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => (
          <li key={u.itemId} className={CAIXA}>
            <span className="text-sm font-semibold">{u.titulo}</span>
            <span className="text-xs text-texto-2">{`${u.destino} · ${u.casamento}`}</span>
            {podeEscolher && (u.precisaEscolher || u.escolhida) && (
              <form onSubmit={aoEnviar} className="flex flex-col gap-2">
                <input type="hidden" name="item" value={u.itemId} />
                <label htmlFor={`alvo-${u.itemId}`} className={ROTULO}>
                  {`Item da NF de venda (${u.rotuloCurto})`}
                </label>
                <select id={`alvo-${u.itemId}`} name="alvo" defaultValue={u.valorAtual} className={CAMPO}>
                  <option value="">Escolha o item…</option>
                  {opcoes.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
                  Salvar escolha<span className="sr-only">{` (${u.rotuloCurto})`}</span>
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
