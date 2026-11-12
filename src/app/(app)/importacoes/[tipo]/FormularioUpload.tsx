'use client';

import { useCallback } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { MENSAGEM_PLANILHA_GRANDE, TAMANHO_MAXIMO_BYTES } from '@/modules/importacao/limites';
import type { EstadoUpload } from './acoes';

type Props = { acao: (anterior: EstadoUpload, dados: FormData) => Promise<EstadoUpload> };

export function FormularioUpload({ acao }: Props) {
  // Confere o tamanho antes de enviar: acima de ~6 MB o Next (ou o nginx) recusa o corpo e o usuário veria um erro genérico.
  const acaoComLimite = useCallback(
    async (anterior: EstadoUpload, dados: FormData): Promise<EstadoUpload> => {
      const arquivo = dados.get('arquivo');
      if (arquivo instanceof File && arquivo.size > TAMANHO_MAXIMO_BYTES) return { erros: [MENSAGEM_PLANILHA_GRANDE] };
      return acao(anterior, dados);
    },
    [acao],
  );
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acaoComLimite, { erros: [] });
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
