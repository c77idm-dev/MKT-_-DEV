'use client';

import { FormularioConfirmado } from '@/components/FormularioConfirmado';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_SECUNDARIO, CARTAO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { PRAZO_APAGADAS_DIAS } from '@/modules/apagadas/dominio';
import type { Perfil } from '@/modules/auth/perfis';
import { pode } from '@/modules/auth/permissoes';
import type { SituacaoRetirada } from '@/modules/retiradas/dominio';
import type { EstadoCorrigirRetirada } from './acoes';

type Acao = (anterior: EstadoCorrigirRetirada, dados: FormData) => Promise<EstadoCorrigirRetirada>;

function FormularioReabrirRetirada({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-reabrir-retirada');
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-reabrir-retirada" className="flex flex-col gap-2">
      <h3 id="titulo-reabrir-retirada" className="text-base font-bold">
        Reabrir
      </h3>
      <p className="text-sm text-texto-2">Volta para Aberta, para corrigir os itens e as quantidades. Depois, conclua a retirada de novo.</p>
      <ListaErros erros={estado.erros} id="erros-reabrir-retirada" />
      <button type="submit" disabled={pendente} className={BOTAO_SECUNDARIO}>
        {pendente ? 'Reabrindo…' : 'Reabrir a retirada'}
      </button>
    </form>
  );
}

/**
 * Corrigir (Gestor) (extra, emenda E29, itens 7 e 8) na Retirada do Full: "Reabrir" (só a Conferida) e "Apagar", com o
 * passo de confirmação da E24. Só o Gestor; as ações do servidor exigem `administrar`.
 */
export function CorrigirRetirada({
  codigo,
  situacao,
  perfil,
  acoes,
}: {
  codigo: string;
  situacao: SituacaoRetirada;
  perfil: Perfil;
  acoes: { reabrir: Acao; apagar: Acao };
}) {
  if (!pode(perfil, 'administrar')) return null;
  return (
    <details id="corrigir" className={`${CARTAO} group`}>
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
        <p className="text-sm text-texto-2">Cada correção fica no histórico, com quem, quando e o valor de antes e de depois.</p>
        {situacao === 'CONFERIDA' && <FormularioReabrirRetirada acao={acoes.reabrir} />}
        <FormularioConfirmado
          acao={acoes.apagar}
          id="apagar-retirada"
          titulo="Apagar"
          descricao={`A retirada fica ${PRAZO_APAGADAS_DIAS} dias em Apagadas, de onde o Gestor a restaura. As devoluções que chegaram pela etiqueta amarela nesta retirada não mudam: se precisar, use "Desfazer a chegada" nelas.`}
          botao="Apagar retirada"
          pergunta={`Tem certeza? A ${codigo} sai da lista de Retiradas do Full e da planilha Volta ao armazém e vai para Apagadas.`}
          confirmar="Sim, apagar retirada"
          enviando="Apagando…"
        />
      </div>
    </details>
  );
}
