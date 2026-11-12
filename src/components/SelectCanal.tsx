import { CANAIS, ROTULO_CANAL } from '@/modules/devolucoes/dominio';
import { CAMPO, ROTULO } from './estilos';

/** Escolha do marketplace (canal) nos formulários. Começa sem escolha, para o operador não gravar o canal errado por descuido. */
export function SelectCanal({ id = 'canal', rotulo = 'Canal (obrigatório)' }: { id?: string; rotulo?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <select id={id} name="canal" required defaultValue="" className={CAMPO}>
        <option value="" disabled>
          Escolha o marketplace
        </option>
        {CANAIS.map((c) => (
          <option key={c} value={c}>
            {ROTULO_CANAL[c]}
          </option>
        ))}
      </select>
    </div>
  );
}
