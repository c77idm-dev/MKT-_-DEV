import Link from 'next/link';
import { CampoTexto } from '@/components/CampoTexto';
import { ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { SubnavCadastros } from './SubnavCadastros';

const TEXTOS = {
  produtos: {
    importar: '/importacoes/produtos',
    novo: '/cadastros/produtos/novo',
    rotuloNovo: 'Novo produto',
    rotuloSalvo: 'Produto',
    rotuloBusca: 'Buscar por SKU, EAN ou descrição',
    ariaBusca: 'Buscar produtos',
  },
  fornecedores: {
    importar: '/importacoes/fornecedores',
    novo: '/cadastros/fornecedores/novo',
    rotuloNovo: 'Novo fornecedor',
    rotuloSalvo: 'Fornecedor',
    rotuloBusca: 'Buscar por razão social ou CNPJ',
    ariaBusca: 'Buscar fornecedores',
  },
} as const;

type Props = { atual: 'produtos' | 'fornecedores'; busca: string; salvo: string };

/** Título, ações, alternância Produtos | Fornecedores, aviso de "salvo" e busca: igual nas duas listas. */
export function CabecalhoCadastro({ atual, busca, salvo }: Props) {
  const t = TEXTOS[atual];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Produtos e Fornecedores</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href={t.importar} className={BOTAO_SECUNDARIO}>
            Importar planilha
          </Link>
          <Link href={t.novo} className={BOTAO_PRIMARIO}>
            {t.rotuloNovo}
          </Link>
        </div>
      </div>
      <SubnavCadastros atual={atual} />
      {salvo && (
        <p role="status" className={ALERTA_OK}>
          {t.rotuloSalvo} {salvo} salvo.
        </p>
      )}
      <form method="get" role="search" aria-label={t.ariaBusca} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <CampoTexto nome="busca" rotulo={t.rotuloBusca} valorInicial={busca} />
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Buscar
        </button>
      </form>
    </>
  );
}
