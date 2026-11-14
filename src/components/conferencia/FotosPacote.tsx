'use client';

import { useState } from 'react';
import { ALERTA_ERRO } from '@/components/estilos';
import { comprimirFoto } from '@/components/midia/comprimirFoto';
import { novoIdCliente } from '@/components/midia/idCliente';
import { useFilaEnvios } from '@/components/midia/useFilaEnvios';
import { DESCRICAO_EVIDENCIA, EVIDENCIAS_DO_PACOTE, ROTULO_EVIDENCIA, type TipoEvidencia } from '@/modules/midia/dominio';
import { estadoDoSlot } from './estadoSlot';
import { SlotEvidencia } from './SlotEvidencia';

/** Spec §6.2: o pacote não identificado é registrado com a Foto 1 e a Foto 2 (ajudam o Gestor a achar o pedido). */
export function FotosPacote({ devolucaoId }: { devolucaoId: string }) {
  const { envios, concluidos, adicionar, tentarDeNovo } = useFilaEnvios(devolucaoId);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(tipo: TipoEvidencia, arquivo: File) {
    setErro(null);
    try {
      await adicionar({ idCliente: novoIdCliente(), itemId: null, tipo, nome: `${tipo.toLowerCase()}.jpg`, tipoConteudo: 'image/jpeg', arquivo: await comprimirFoto(arquivo) });
    } catch {
      setErro('Não foi possível ler esta foto. Tire de novo pela câmera.');
    }
  }

  return (
    <section aria-labelledby="titulo-fotos-pacote" className="flex flex-col gap-3">
      <h2 id="titulo-fotos-pacote" className="text-base font-bold">
        Fotos do pacote
      </h2>
      <p className="text-sm text-texto-2">Tire agora a Foto 1 e a Foto 2: elas ajudam o Gestor a identificar o pedido.</p>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      {EVIDENCIAS_DO_PACOTE.map((tipo) => (
        <SlotEvidencia
          key={tipo}
          titulo={ROTULO_EVIDENCIA[tipo]}
          descricao={DESCRICAO_EVIDENCIA[tipo]}
          estado={estadoDoSlot({ tipo, itemId: null }, { envios, concluidos, evidencias: [] })}
          aoEscolher={(a) => void escolher(tipo, a)}
          aoTentarDeNovo={(id) => void tentarDeNovo(id)}
        />
      ))}
    </section>
  );
}
