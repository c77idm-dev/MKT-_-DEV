import type { VistaBackup } from '@/modules/acabamento/backup';
import { ALERTA_ATENCAO, ALERTA_ERRO, ALERTA_OK, CARTAO } from '../estilos';

const ESTILO_TOM = { bom: ALERTA_OK, atencao: ALERTA_ATENCAO, erro: ALERTA_ERRO } as const;

/** (extra, decisão 22) Situação do último backup diário, no alto da tela Falhas. */
export function CartaoBackup({ backup }: { backup: VistaBackup | null }) {
  return (
    <section aria-labelledby="titulo-backup" className={`${CARTAO} flex flex-col gap-2`}>
      <h2 id="titulo-backup" className="text-base font-bold">
        Backup diário
      </h2>
      {backup ? (
        <>
          <p className={ESTILO_TOM[backup.tom]}>{backup.texto}</p>
          {backup.erro ? <p className="break-words text-sm text-texto-2">{backup.erro}</p> : null}
        </>
      ) : (
        <p className="text-sm text-texto-2">Nenhum backup registrado ainda.</p>
      )}
    </section>
  );
}
