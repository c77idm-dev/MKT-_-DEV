import Link from 'next/link';
import { BOTAO_SECUNDARIO } from './estilos';

type Props = { pagina: number; total: number; porPagina: number; hrefDaPagina: (pagina: number) => string };

export function Paginacao({ pagina, total, porPagina, hrefDaPagina }: Props) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
      {pagina > 1 ? (
        <Link href={hrefDaPagina(pagina - 1)} className={BOTAO_SECUNDARIO}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-texto-2">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={hrefDaPagina(pagina + 1)} className={BOTAO_SECUNDARIO}>
          Próxima
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
