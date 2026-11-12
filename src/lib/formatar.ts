const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partes(data: Date): Record<string, string> {
  return Object.fromEntries(FORMATO.formatToParts(data).map((p) => [p.type, p.value]));
}

/** "12/11/2026 14:32", no horário de Brasília. */
export function formatarDataHora(data: Date): string {
  const p = partes(data);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "12/11", no horário de Brasília. */
export function formatarDiaMes(data: Date): string {
  const p = partes(data);
  return `${p.day}/${p.month}`;
}

/** Coluna date guardada como "2026-11-05" → "05/11/2026". */
export function formatarDataIso(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "1234.5" (coluna numeric) → "R$ 1.234,50". */
export function formatarMoeda(valor: string | null): string {
  if (valor === null) return '—';
  const [inteiro, centavos] = Number(valor).toFixed(2).split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}
