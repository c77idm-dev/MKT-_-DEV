'use client';

import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { Mapeamento } from '@/modules/importacao/tipos';
import type { EstadoConfirmacao } from '../acoes';

type Props = {
  acao: (anterior: EstadoConfirmacao, dados: FormData) => Promise<EstadoConfirmacao>;
  /** O mesmo mapeamento que gerou a prévia: é ele que vai ser gravado. */
  mapeamento: Mapeamento;
  habilitado: boolean;
};

export function FormularioConfirmacao({ acao, mapeamento, habilitado }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className="contents">
      {Object.entries(mapeamento).map(([chave, cabecalho]) => (
        <input key={chave} type="hidden" name={`campo:${chave}`} value={cabecalho ?? ''} />
      ))}
      <ListaErros erros={estado.erros} />
      {!habilitado && <p className="text-sm text-texto-2">Ajuste as colunas até haver pelo menos uma linha pronta.</p>}
      <RodapeFormulario>
        <button type="submit" disabled={!habilitado || pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Importando…' : 'Confirmar importação'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
