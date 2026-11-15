/**
 * Faixa decorativa de código de barras (do mockup "C"), só com CSS: barras de larguras irregulares (1, 2 e 3 px)
 * com vãos de 2 e 3 px, num `repeating-linear-gradient` em `currentColor`. Ocupa a largura toda do pai.
 * - `tom="claro"`: barras brancas a 85% sobre fundo verde.
 * - `tom="escuro"`: barras na cor do texto sobre fundo claro.
 * É toda decorativa (`aria-hidden`), inclusive a legenda.
 */
const BARRAS =
  'repeating-linear-gradient(90deg,' +
  ' currentColor 0 2px, transparent 2px 4px,' +
  ' currentColor 4px 5px, transparent 5px 8px,' +
  ' currentColor 8px 11px, transparent 11px 13px,' +
  ' currentColor 13px 14px, transparent 14px 16px,' +
  ' currentColor 16px 18px, transparent 18px 21px,' +
  ' currentColor 21px 24px, transparent 24px 26px,' +
  ' currentColor 26px 27px, transparent 27px 30px)';

export function FaixaCodigoBarras({ legenda, tom = 'claro' }: { legenda?: string; tom?: 'claro' | 'escuro' }) {
  const claro = tom === 'claro';
  return (
    <div aria-hidden="true" data-tom={tom} className="flex w-full flex-col gap-1.5">
      <div
        data-barras
        className={`h-[30px] w-full ${claro ? 'text-white/85' : 'text-texto'}`}
        style={{ backgroundImage: BARRAS }}
      />
      {legenda && (
        <p
          data-legenda
          // pl compensa o espaçamento que sobra depois da última letra, para a legenda ficar no centro de verdade.
          className={`pl-[0.3em] text-center font-mono text-[10px] tracking-[0.3em] uppercase ${claro ? 'text-destaque-suave' : 'text-texto-2'}`}
        >
          {legenda}
        </p>
      )}
    </div>
  );
}
