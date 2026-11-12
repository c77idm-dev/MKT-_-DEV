import type { TomSelo } from '@/modules/devolucoes/selos';

const CLASSES: Record<TomSelo, string> = {
  erro: 'bg-erro-suave text-erro',
  atencao: 'bg-atencao-suave text-atencao',
  destaque: 'bg-destaque-suave text-destaque',
  neutro: 'bg-fundo text-texto-2',
};

export function Selo({ texto, tom }: { texto: string; tom: TomSelo }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASSES[tom]}`}>{texto}</span>;
}
