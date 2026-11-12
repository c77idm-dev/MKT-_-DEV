/** Usado pelo ImageResponse (Satori): só estilos inline e flexbox. */
export function IconeApp({ tamanho }: { tamanho: number }) {
  const desenho = Math.round(tamanho * 0.56);
  return (
    <div
      style={{
        width: tamanho,
        height: tamanho,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0F766E',
      }}
    >
      <svg
        width={desenho}
        height={desenho}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
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
