import { CAMPO, ROTULO } from './estilos';

type Props = {
  nome: string;
  rotulo: string;
  id?: string;
  valorInicial?: string;
  obrigatorio?: boolean;
  /** Códigos (SKU, EAN, pedido, rastreio): fonte mono e sem corretor. */
  mono?: boolean;
  tipo?: 'text' | 'email' | 'password' | 'date' | 'number';
  modoTeclado?: 'text' | 'numeric' | 'decimal' | 'email';
  /** Teclado do celular já em maiúsculas. */
  maiusculas?: boolean;
  maximo?: number;
  autoComplete?: string;
  dica?: string;
};

/** Rótulo em cima e campo na largura toda: uma coluna no celular. */
export function CampoTexto({
  nome,
  rotulo,
  id = nome,
  valorInicial = '',
  obrigatorio = false,
  mono = false,
  tipo = 'text',
  modoTeclado,
  maiusculas = false,
  maximo,
  autoComplete = 'off',
  dica,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        type={tipo}
        defaultValue={valorInicial}
        required={obrigatorio}
        inputMode={modoTeclado}
        autoCapitalize={maiusculas ? 'characters' : undefined}
        spellCheck={mono ? false : undefined}
        maxLength={maximo}
        autoComplete={autoComplete}
        aria-describedby={dica ? `${id}-dica` : undefined}
        className={`${CAMPO}${mono ? ' font-mono' : ''}`}
      />
      {dica && (
        <p id={`${id}-dica`} className="text-xs text-texto-2">
          {dica}
        </p>
      )}
    </div>
  );
}
