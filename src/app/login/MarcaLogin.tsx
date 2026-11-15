/**
 * Marca provisória da tela de login: o mesmo desenho de setas do ícone do PWA (`IconeApp`), em branco.
 * Quando a logo de verdade chegar, troca-se só este arquivo. É decorativa: o nome vem do título ao lado.
 */
export function MarcaLogin() {
  return (
    <div
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-white"
    >
      <svg
        width={26}
        height={26}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 0115.5-6.2" />
        <path d="M19 3v4h-4" />
        <path d="M21 12a9 9 0 01-15.5 6.2" />
        <path d="M5 21v-4h4" />
      </svg>
    </div>
  );
}
