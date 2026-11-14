'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { CSOSN, CST_ICMS } from '@/modules/fiscal/dominio';
import type { RegraFiscal } from '@/modules/fiscal/regras';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; regra: RegraFiscal; regime: RegimeTributario };

/** Spec §8.2: CFOP, CST/CSOSN do ICMS, CST do PIS e do COFINS e informações complementares de uma combinação. */
export function FormularioRegra({ acao, regra, regime }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  const simples = regime === 'SIMPLES';
  return (
    <form onSubmit={aoEnviar} aria-label="Regra fiscal" className="flex flex-col gap-4">
      <CampoTexto nome="cfop" rotulo="CFOP" valorInicial={regra.cfop} obrigatorio mono modoTeclado="numeric" maximo={4} />
      <CampoTexto
        nome="icms"
        rotulo={simples ? 'CSOSN do ICMS' : 'CST do ICMS'}
        valorInicial={regra.icmsSituacaoTributaria}
        obrigatorio
        mono
        modoTeclado="numeric"
        maximo={3}
        dica={`Valores: ${(simples ? CSOSN : CST_ICMS).join(', ')}`}
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="pis" rotulo="CST do PIS" valorInicial={regra.pisSituacaoTributaria} obrigatorio mono modoTeclado="numeric" maximo={2} />
        <CampoTexto nome="cofins" rotulo="CST do COFINS" valorInicial={regra.cofinsSituacaoTributaria} obrigatorio mono modoTeclado="numeric" maximo={2} />
      </div>
      <CampoTexto nome="natureza" rotulo="Natureza da operação" valorInicial={regra.naturezaOperacao} obrigatorio maximo={60} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="informacoes" className={ROTULO}>
          Informações complementares
        </label>
        <textarea
          id="informacoes"
          name="informacoes"
          rows={4}
          maxLength={2000}
          defaultValue={regra.informacoesComplementares ?? ''}
          aria-describedby="informacoes-dica"
          className={`${CAMPO} min-h-28 py-2`}
        />
        <p id="informacoes-dica" className="text-xs text-texto-2">
          Marcadores: {'{chaves}'} (NF de venda), {'{devolucao}'} (código DEV), {'{seriais}'} (S/N) e, nas remessas, {'{lote}'}.
        </p>
      </div>
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar regra'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
