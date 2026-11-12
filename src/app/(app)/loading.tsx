/** Esqueleto enquanto a tela carrega (Wi-Fi lento): mostra que algo está acontecendo e evita toque duplo. */
export default function Carregando() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <p className="text-sm font-semibold text-texto-2">Carregando…</p>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-3">
        <div className="h-7 w-1/2 rounded-lg bg-borda" />
        <div className="h-20 rounded-xl bg-borda" />
        <div className="h-20 rounded-xl bg-borda" />
      </div>
    </div>
  );
}
