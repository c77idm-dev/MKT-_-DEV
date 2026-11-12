import { Fragment } from 'react';
import { Selo } from '@/components/Selo';
import type { LinhaPrevia } from '@/modules/importacao/definicao';
import type { CampoImportacao } from '@/modules/importacao/mapeamento';

/** Prévia em cartões (cabe no celular): uma linha da planilha por cartão, com os erros e avisos dela. */
export function CartoesPrevia({ campos, linhas }: { campos: CampoImportacao[]; linhas: LinhaPrevia[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {linhas.map((linha) => {
        const pronta = linha.erros.length === 0;
        return (
          <li
            key={linha.numeroLinha}
            className={`flex flex-col gap-2 rounded-xl border bg-superficie p-3 ${pronta ? 'border-borda' : 'border-erro'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Linha {linha.numeroLinha}</span>
              <Selo texto={pronta ? 'Pronta' : 'Com erro'} tom={pronta ? 'bom' : 'erro'} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {campos.map((campo) => (
                <Fragment key={campo.chave}>
                  <dt className="text-texto-2">{campo.rotulo}</dt>
                  <dd className="[overflow-wrap:anywhere]">{linha.valores[campo.chave] || '—'}</dd>
                </Fragment>
              ))}
            </dl>
            {linha.erros.length > 0 && (
              <ul className="list-disc pl-5 text-sm font-medium text-erro">
                {linha.erros.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            )}
            {linha.avisos.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-atencao">
                {linha.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
