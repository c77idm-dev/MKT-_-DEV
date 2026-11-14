'use client';

import { ALERTA_ATENCAO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import { MOTIVOS_PROBLEMA, type EntradaItem } from '@/modules/conferencia/regras';
import { ROTULO_MOTIVO, type MotivoItem } from '@/modules/devolucoes/dominio';

type Props = {
  itens: ItemConferencia[];
  valores: Record<string, EntradaItem>;
  divergentes: Record<string, boolean>;
  falta: string[];
  enviosPendentes: number;
  aoMudar: (itemId: string, parcial: Partial<EntradaItem>, salvarAgora?: boolean) => void;
};

const OPCAO = 'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-borda-campo px-3 text-center text-[15px] font-semibold';

function DestinoDaUnidade({ item, valor, divergente, aoMudar }: { item: ItemConferencia; valor: EntradaItem; divergente: boolean; aoMudar: Props['aoMudar'] }) {
  const mudar = (parcial: Partial<EntradaItem>, salvarAgora?: boolean) => aoMudar(item.id, parcial, salvarAgora);
  const motivoProblema = valor.motivo && valor.motivo !== 'AUSENTE' ? valor.motivo : divergente ? 'DIVERGENTE' : null;
  return (
    <div className={CARTAO}>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-bold">
          Unidade {item.unidade} <span className="break-all font-mono text-[13px] font-semibold">{item.sku}</span>
        </legend>
        {valor.decisao === 'AUSENTE' ? (
          <>
            <p className="text-[15px]">Ausente (não veio no pacote).</p>
            <button type="button" onClick={() => mudar({ decisao: null, motivo: null }, true)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Desfazer: a unidade veio
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className={`${OPCAO} has-[:checked]:border-bom has-[:checked]:bg-bom-suave has-[:checked]:text-bom`}>
                <input type="radio" name={`destino-${item.id}`} checked={valor.decisao === 'BOM'} onChange={() => mudar({ decisao: 'BOM', motivo: null }, true)} className="size-5" />
                Estoque Bom
              </label>
              <label className={`${OPCAO} has-[:checked]:border-problema has-[:checked]:bg-problema-suave has-[:checked]:text-problema`}>
                <input
                  type="radio"
                  name={`destino-${item.id}`}
                  checked={valor.decisao === 'PROBLEMA'}
                  onChange={() => mudar({ decisao: 'PROBLEMA', motivo: motivoProblema }, motivoProblema !== null)}
                  className="size-5"
                />
                Estoque Problema
              </label>
            </div>
            {divergente && <p className={ALERTA_ATENCAO}>O código lido é diferente do esperado: sugerimos Estoque Problema, motivo Divergente.</p>}
            {valor.decisao === 'PROBLEMA' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`motivo-${item.id}`} className={ROTULO}>
                  Motivo da unidade {item.unidade}
                </label>
                <select
                  id={`motivo-${item.id}`}
                  value={valor.motivo ?? ''}
                  onChange={(e) => mudar({ motivo: (e.target.value || null) as MotivoItem | null }, e.target.value !== '')}
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`observacao-${item.id}`} className={ROTULO}>
                Observação (opcional)
              </label>
              <textarea
                id={`observacao-${item.id}`}
                value={valor.observacao}
                onChange={(e) => mudar({ observacao: e.target.value })}
                onBlur={() => mudar({}, true)}
                maxLength={500}
                rows={2}
                className={`${CAMPO} min-h-20 py-2`}
              />
            </div>
            <button type="button" onClick={() => mudar({ decisao: 'AUSENTE', motivo: 'AUSENTE' }, true)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Não veio no pacote (ausente)
            </button>
          </>
        )}
      </fieldset>
    </div>
  );
}

/** Spec §6.3, passo 5: Estoque Bom ou Estoque Problema (com motivo e observação), ou ausente. Mostra o que ainda falta. */
export function PassoDestino({ itens, valores, divergentes, falta, enviosPendentes, aoMudar }: Props) {
  return (
    <section aria-labelledby="titulo-destino" className="flex flex-col gap-3">
      <h2 id="titulo-destino" className="text-lg font-bold">
        Destino de cada unidade
      </h2>
      {itens.map((item) => (
        <DestinoDaUnidade key={item.id} item={item} valor={valores[item.id]} divergente={divergentes[item.id] ?? false} aoMudar={aoMudar} />
      ))}
      <div className={`${CARTAO} flex flex-col gap-2`} aria-live="polite">
        <h3 className="text-base font-bold">Para concluir</h3>
        {enviosPendentes > 0 && (
          <p className={ALERTA_ATENCAO}>
            {enviosPendentes === 1 ? '1 arquivo ainda está subindo.' : `${enviosPendentes} arquivos ainda estão subindo.`}
          </p>
        )}
        {falta.length === 0 ? (
          <p className="text-[15px] font-semibold text-bom">Tudo pronto para concluir.</p>
        ) : (
          <ul className="list-disc pl-5 text-[15px]">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
