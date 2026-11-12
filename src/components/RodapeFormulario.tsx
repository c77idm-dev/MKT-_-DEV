import type { ReactNode } from 'react';

/**
 * Botões do formulário. No celular ficam presos logo acima da barra de abas, sempre ao alcance do polegar.
 * Use dentro de um CARTAO (p-4): o -mx-4 estica o rodapé até as bordas do cartão.
 */
export function RodapeFormulario({ children }: { children: ReactNode }) {
  return (
    <div className="acima-barra sticky z-20 -mx-4 flex flex-col gap-2 border-t border-borda bg-superficie/95 px-4 py-3 md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:p-0">
      {children}
    </div>
  );
}
