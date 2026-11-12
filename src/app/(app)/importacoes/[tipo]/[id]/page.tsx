import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALERTA_ATENCAO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { calcularPrevia, mapeamentoEfetivo, obterImportacao } from '@/modules/importacao/servico';
import { definirMapeamentoAcao, confirmarImportacaoAcao } from '../acoes';
import { CartoesPrevia } from './CartoesPrevia';
import { FormularioConfirmacao } from './FormularioConfirmacao';
import { FormularioColunas, ImportacaoInterativa } from './ImportacaoInterativa';

export const metadata: Metadata = { title: 'Importar planilha · Gestão de Devoluções' };

const LIMITE_PREVIA = 200;

export default async function PaginaImportacao({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();

  if (imp.situacao === 'CONCLUIDA') {
    const r = imp.resumo;
    const comErro = r?.linhasComErro ?? [];
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <h1 className="text-xl font-bold">Importação concluída: {def.titulo}</h1>
        <div role="status" className={`${CARTAO} flex flex-col gap-1 text-[15px]`}>
          <p>
            {def.rotuloCriados}: <strong>{r?.criados ?? 0}</strong>
          </p>
          {def.rotuloAtualizados && (
            <p>
              {def.rotuloAtualizados}: <strong>{r?.atualizados ?? 0}</strong>
            </p>
          )}
          <p>
            Linhas com erro (ignoradas): <strong>{r?.ignorados ?? 0}</strong>
            {comErro.length > 0 ? ` (${comErro.length === 1 ? 'linha' : 'linhas'} ${comErro.join(', ')})` : ''}
          </p>
          {(r?.puladas ?? []).map((x) => (
            <p key={x.linha} className="text-[14px] text-texto-2">
              Linha {x.linha}: {x.erro}
            </p>
          ))}
        </div>
        <div className="grid gap-2 sm:flex">
          <Link href={def.voltarPara} className={BOTAO_PRIMARIO}>
            Voltar para {def.rotuloVoltar}
          </Link>
          <Link href={`/importacoes/${def.tipo}`} className={BOTAO_SECUNDARIO}>
            Importar outra planilha
          </Link>
        </div>
      </div>
    );
  }

  const mapeamento = await mapeamentoEfetivo(db, def, imp);
  const previa = await calcularPrevia(db, def, imp, mapeamento);
  const exemplo = imp.linhas[0] ?? [];
  const camposMapeados = def.campos.filter((c) => mapeamento[c.chave]);
  // Mobile-first: as linhas com erro aparecem primeiro, para não precisar rolar procurando.
  const linhasOrdenadas = [...previa.linhas.filter((l) => l.erros.length > 0), ...previa.linhas.filter((l) => l.erros.length === 0)];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={def.voltarPara} className={LINK_VOLTAR}>
          ← {def.rotuloVoltar}
        </Link>
        <h1 className="text-xl font-bold">Importar planilha: {def.titulo}</h1>
        <p className="text-sm text-texto-2 [overflow-wrap:anywhere]">
          Arquivo <span className="font-mono">{imp.nomeArquivo}</span> · {imp.linhas.length} linhas
        </p>
      </div>

      <ImportacaoInterativa chaves={def.campos.map((c) => c.chave)} mapeamento={mapeamento}>
        <section aria-labelledby="titulo-colunas" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-colunas" className="text-base font-bold">
            1. Colunas da planilha
          </h2>
          <p className="text-sm text-texto-2">Para cada campo do sistema, escolha a coluna da planilha. O que parece igual já vem sugerido.</p>
          <FormularioColunas
            campos={def.campos.map((c) => ({ chave: c.chave, rotulo: c.rotulo, obrigatorio: c.obrigatorio }))}
            cabecalhos={imp.cabecalhos}
            exemplo={exemplo}
            acao={definirMapeamentoAcao.bind(null, def.tipo, imp.id)}
          />
        </section>

        <section aria-labelledby="titulo-previa" className="flex flex-col gap-3">
          <h2 id="titulo-previa" className="text-base font-bold">
            2. Prévia
          </h2>
          {previa.faltando.length > 0 ? (
            <p className={ALERTA_ATENCAO}>Escolha a coluna de: {previa.faltando.join(', ')}.</p>
          ) : (
            <>
              <p className="text-[15px]">
                <strong>{previa.validas}</strong> {previa.validas === 1 ? 'linha pronta' : 'linhas prontas'} para importar ·{' '}
                <strong>{previa.comErro}</strong> com erro (serão ignoradas)
              </p>
              <CartoesPrevia campos={camposMapeados} linhas={linhasOrdenadas.slice(0, LIMITE_PREVIA)} />
              {linhasOrdenadas.length > LIMITE_PREVIA && (
                <p className="text-sm text-texto-2">
                  Mostrando {LIMITE_PREVIA} de {linhasOrdenadas.length} linhas. Todas foram verificadas.
                </p>
              )}
            </>
          )}
        </section>

        {/* "contents": o rodapé preso (sticky) precisa da página inteira como área, não de um cartão curto. */}
        <section aria-labelledby="titulo-confirmar" className="contents">
          <h2 id="titulo-confirmar" className="text-base font-bold">
            3. Confirmar
          </h2>
          <FormularioConfirmacao
            acao={confirmarImportacaoAcao.bind(null, def.tipo, imp.id)}
            mapeamento={mapeamento}
            habilitado={previa.faltando.length === 0 && previa.validas > 0}
          />
        </section>
      </ImportacaoInterativa>
    </div>
  );
}
