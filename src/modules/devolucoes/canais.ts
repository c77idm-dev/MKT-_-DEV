import { normalizarTexto } from '@/lib/texto';
import { CANAIS, type Canal } from './dominio';

const APELIDOS: Record<string, Canal> = {
  ml: 'MERCADO_LIVRE',
  meli: 'MERCADO_LIVRE',
  mercadolivre: 'MERCADO_LIVRE',
  mercadolibre: 'MERCADO_LIVRE',
  amazon: 'AMAZON',
  amazonbr: 'AMAZON',
  shopee: 'SHOPEE',
  magalu: 'MAGALU',
  magazineluiza: 'MAGALU',
  tiktok: 'TIKTOK_SHOP',
  tiktokshop: 'TIKTOK_SHOP',
  shein: 'SHEIN',
};

/** Aceita o código (MERCADO_LIVRE), o nome (Mercado Livre) ou apelidos comuns (ML, Magazine Luiza, TikTok). */
export function interpretarCanal(texto: string): Canal | null {
  const compacto = normalizarTexto(texto).replace(/ /g, '');
  if (!compacto) return null;
  const porCodigo = CANAIS.find((c) => c.toLowerCase().replace(/_/g, '') === compacto);
  return porCodigo ?? APELIDOS[compacto] ?? null;
}
