import type { ReactNode } from 'react';
import { ROTULO } from '@/components/estilos';

/** Par rótulo e valor numa lista de definição. Códigos vão em mono e quebram em qualquer ponto (sem rolagem lateral). */
export function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : '[overflow-wrap:anywhere]'}`}>{children}</dd>
    </div>
  );
}
