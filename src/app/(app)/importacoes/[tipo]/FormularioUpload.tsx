'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoUpload } from './acoes';

type Props = { acao: (anterior: EstadoUpload, dados: FormData) => Promise<EstadoUpload> };

export function FormularioUpload({ acao }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="arquivo" className={ROTULO}>
          Planilha
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          required
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-borda-forte file:bg-superficie file:px-4 file:font-semibold"
        />
      </div>
      <ListaErros erros={estado.erros} />
      <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
        {pendente ? 'Lendo a planilha…' : 'Enviar planilha'}
      </button>
    </form>
  );
}
