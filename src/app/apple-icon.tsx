import { ImageResponse } from 'next/og';
import { IconeApp } from '@/components/IconeApp';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function IconeApple() {
  return new ImageResponse(<IconeApp tamanho={180} />, size);
}
