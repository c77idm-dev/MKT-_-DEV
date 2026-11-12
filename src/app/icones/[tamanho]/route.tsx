import { ImageResponse } from 'next/og';
import { IconeApp } from '@/components/IconeApp';

const TAMANHOS = new Set([192, 512]);

/** Ícones PNG do manifesto. Ficam fora do grupo (app): o celular baixa sem login. */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ tamanho: string }> }) {
  const tamanho = Number((await params).tamanho);
  if (!TAMANHOS.has(tamanho)) return new Response('Não encontrado', { status: 404 });
  return new ImageResponse(<IconeApp tamanho={tamanho} />, { width: tamanho, height: tamanho });
}
