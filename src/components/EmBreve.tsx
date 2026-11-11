export function EmBreve({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <section className="mx-auto mt-10 max-w-lg rounded-xl border border-borda bg-superficie p-8 text-center">
      <h1 className="text-xl font-bold">{titulo}</h1>
      <p className="mt-2 text-sm text-texto-2">Esta área chega na Fase {fase} do projeto.</p>
    </section>
  );
}
