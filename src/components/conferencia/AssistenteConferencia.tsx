'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, LINK_VOLTAR } from '@/components/estilos';
import { comprimirFoto } from '@/components/midia/comprimirFoto';
import { novoIdCliente } from '@/components/midia/idCliente';
import { useFilaEnvios } from '@/components/midia/useFilaEnvios';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import { colunasDaDecisao, entradaDoItem, pendenciasDaConclusao, videoExigido, type EntradaItem } from '@/modules/conferencia/regras';
import type { VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { DESCRICAO_EVIDENCIA, LIMITE_VIDEO_BYTES, ROTULO_EVIDENCIA, ehFoto, type TipoEvidencia } from '@/modules/midia/dominio';
import { estadoDoSlot, evidenciasQueContam, type EvidenciaServidor } from './estadoSlot';
import { PassoDestino } from './PassoDestino';
import { PassoItem } from './PassoItem';
import { montarPassos, passoCompleto } from './passos';
import { ProgressoSegmentos } from './ProgressoSegmentos';
import { SlotEvidencia } from './SlotEvidencia';
import type { RespostaAcao } from './tipos';

export type AcoesConferencia = {
  salvarItem: (devolucaoId: string, itemId: string, entrada: EntradaItem) => Promise<RespostaAcao>;
  registrarEan: (devolucaoId: string, itemId: string, lido: string | null) => Promise<RespostaAcao<{ resultado: ResultadoEan }>>;
  concluir: (devolucaoId: string, codigo: string) => Promise<RespostaAcao<{ destino: string }>>;
  desistir: (devolucaoId: string, codigo: string) => Promise<RespostaAcao<{ destino: string }>>;
};

type Props = {
  devolucao: { id: string; codigo: string; rastreio: string | null };
  itens: ItemConferencia[];
  evidencias: EvidenciaServidor[];
  videoObrigatorio: VideoObrigatorio;
  passoInicial: number;
  acoes: AcoesConferencia;
};

const ID_ERROS = 'erros-conferencia';
const AVISO_SEM_REDE = 'Sem conexão: o que você preencheu fica nesta tela e é salvo quando a internet voltar (no mais tardar, ao concluir).';
const SEM_REDE_CONCLUIR = 'Sem conexão. A conferência só termina com internet: tente de novo quando a conexão voltar.';

function leituraInicial(i: ItemConferencia): ResultadoEan | null {
  if (!i.eanLido) return null;
  return i.divergente
    ? { situacao: 'diverge', produtoRecebido: i.produtoRecebido, sugerirMotivo: 'DIVERGENTE' }
    : { situacao: 'confere', produtoRecebido: i.produtoRecebido, sugerirMotivo: null };
}

/**
 * Conferência no celular (spec §6.3 e §6.0). O estado da tela é a fonte da verdade enquanto ela está aberta: funciona
 * sem internet (fotos e vídeo na fila do aparelho; dados das unidades salvos quando der). Concluir exige internet.
 */
export function AssistenteConferencia({ devolucao, itens, evidencias, videoObrigatorio, passoInicial, acoes }: Props) {
  const router = useRouter();
  const passos = useMemo(() => montarPassos(itens), [itens]);
  const [indice, setIndice] = useState(() => Math.min(Math.max(0, passoInicial), passos.length - 1));
  const [valores, setValores] = useState<Record<string, EntradaItem>>(() => Object.fromEntries(itens.map((i) => [i.id, entradaDoItem(i)])));
  // Valor mais recente de cada unidade: respostas assíncronas (leitura do EAN) não podem partir de uma renderização velha.
  const valoresRef = useRef(valores);
  const [leituras, setLeituras] = useState<Record<string, ResultadoEan | null>>(() => Object.fromEntries(itens.map((i) => [i.id, leituraInicial(i)])));
  const [naoSalvos, setNaoSalvos] = useState<string[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarDesistencia, setConfirmarDesistencia] = useState(false);

  // Decisão 15: pede os dados de novo ao servidor depois de cada envio e enquanto há mídia processando (só com rede).
  const atualizar = useCallback(() => {
    if (navigator.onLine) router.refresh();
  }, [router]);
  const { envios, concluidos, adicionar, tentarDeNovo } = useFilaEnvios(devolucao.id, atualizar);
  const processando = evidencias.some((e) => e.situacao === 'RECEBIDA' || e.situacao === 'PROCESSANDO');
  useEffect(() => {
    if (!processando) return;
    const relogio = window.setInterval(atualizar, 10_000);
    return () => window.clearInterval(relogio);
  }, [processando, atualizar]);

  // Erros novos: foco e rolagem até a caixa (o botão principal fica embaixo, a caixa em cima).
  useEffect(() => {
    if (erros.length === 0) return;
    const caixa = document.getElementById(ID_ERROS);
    caixa?.focus();
    caixa?.scrollIntoView({ block: 'center' });
  }, [erros]);

  const fonte = { envios, concluidos, evidencias };
  const slot = (tipo: TipoEvidencia, itemId: string | null = null) => estadoDoSlot({ tipo, itemId }, fonte);
  const contam = evidenciasQueContam(evidencias, concluidos);
  const itensRegra = itens.map((i) => {
    const c = colunasDaDecisao(valores[i.id].decisao, valores[i.id].motivo);
    return { id: i.id, unidade: i.unidade, ...('erro' in c ? { destino: null, motivo: null } : c) };
  });
  const exigeVideo = videoExigido(videoObrigatorio, itensRegra);
  const falta = pendenciasDaConclusao({ itens: itensRegra, evidencias: contam, videoObrigatorio });
  const completos = passos.map((p) =>
    passoCompleto(p, {
      enviada: (tipo, itemId) => contam.some((e) => e.tipo === tipo && e.itemId === itemId),
      decisao: (id) => valores[id].decisao,
      videoExigido: exigeVideo,
      itens,
    }),
  );
  const passo = passos[indice];

  async function escolher(tipo: TipoEvidencia, itemId: string | null, arquivo: File) {
    setErros([]);
    if (!ehFoto(tipo) && arquivo.size > LIMITE_VIDEO_BYTES) {
      setErros(['Vídeo grande demais (máximo 300 MB). Grave em 1080p, com até 2 minutos.']);
      return;
    }
    try {
      const foto = ehFoto(tipo);
      await adicionar({
        idCliente: novoIdCliente(),
        itemId,
        tipo,
        nome: foto ? `${tipo.toLowerCase()}.jpg` : arquivo.name || 'video.mp4',
        tipoConteudo: foto ? 'image/jpeg' : arquivo.type || 'video/mp4',
        arquivo: foto ? await comprimirFoto(arquivo) : arquivo,
      });
    } catch {
      setErros([`Não foi possível ler este arquivo. Tire a ${ROTULO_EVIDENCIA[tipo]} de novo pela câmera.`]);
    }
  }

  async function salvar(itemId: string, entrada: EntradaItem): Promise<'ok' | 'sem_rede' | 'erro'> {
    try {
      const r = await acoes.salvarItem(devolucao.id, itemId, entrada);
      if (r.ok) {
        setNaoSalvos((lista) => lista.filter((x) => x !== itemId));
        return 'ok';
      }
      setErros(r.erros);
      return 'erro';
    } catch {
      setNaoSalvos((lista) => (lista.includes(itemId) ? lista : [...lista, itemId]));
      return 'sem_rede';
    }
  }

  function mudar(itemId: string, parcial: Partial<EntradaItem>, salvarAgora = false) {
    const novo = { ...valoresRef.current[itemId], ...parcial };
    valoresRef.current = { ...valoresRef.current, [itemId]: novo };
    setValores(valoresRef.current);
    if (!salvarAgora) return;
    void salvar(itemId, novo).then((r) => {
      if (r === 'sem_rede') setAviso(AVISO_SEM_REDE);
    });
  }

  async function conferirEan(itemId: string, lido: string | null) {
    setErros([]);
    try {
      const r = await acoes.registrarEan(devolucao.id, itemId, lido);
      if (!r.ok) {
        setErros(r.erros);
        return;
      }
      setLeituras((l) => ({ ...l, [itemId]: r.resultado }));
      // Spec §6.3: EAN diferente do esperado sugere o motivo "divergente" (a pessoa pode trocar no destino).
      if (r.resultado.sugerirMotivo && valoresRef.current[itemId].decisao === null) mudar(itemId, { decisao: 'PROBLEMA', motivo: r.resultado.sugerirMotivo });
    } catch {
      setErros(['Sem conexão: a leitura do código precisa de internet. Tente de novo quando a conexão voltar.']);
    }
  }

  function irPara(n: number) {
    const alvo = Math.min(Math.max(0, n), passos.length - 1);
    setIndice(alvo);
    setErros([]);
    setConfirmarDesistencia(false);
    // Sem ida ao servidor: se o Android recarregar a aba ao voltar da câmera, o passo volta pela URL.
    window.history.replaceState(null, '', `?passo=${alvo}`);
    window.scrollTo({ top: 0 });
  }

  async function continuar() {
    if (passo.tipo === 'item') {
      setOcupado(true);
      const r = await salvar(passo.itemId, valores[passo.itemId]);
      setOcupado(false);
      if (r === 'erro') return;
      if (r === 'sem_rede') setAviso(AVISO_SEM_REDE);
    }
    irPara(indice + 1);
  }

  async function concluir() {
    setErros([]);
    // Os que estão em erro não sobem sozinhos: a pessoa precisa agir. Os outros (em espera ou enviando) é só aguardar.
    const comErro = envios.filter((e) => e.estado === 'erro').length;
    if (comErro > 0) {
      setErros([`${comErro} arquivo(s) não foram enviados: toque em Tentar de novo ou tire de novo.`]);
      return;
    }
    if (envios.length > 0) {
      setErros([envios.length === 1 ? 'Aguarde: 1 arquivo ainda não subiu.' : `Aguarde: ${envios.length} arquivos ainda não subiram.`]);
      return;
    }
    if (falta.length > 0) {
      setErros(falta.map((f) => `Falta: ${f}`));
      return;
    }
    setOcupado(true);
    try {
      for (const id of naoSalvos) {
        const r = await salvar(id, valores[id]);
        if (r === 'sem_rede') setErros([SEM_REDE_CONCLUIR]);
        if (r !== 'ok') return;
      }
      const r = await acoes.concluir(devolucao.id, devolucao.codigo);
      if (r.ok) {
        router.push(r.destino);
        return;
      }
      setErros(r.erros);
    } catch {
      setErros([SEM_REDE_CONCLUIR]);
    } finally {
      setOcupado(false);
    }
  }

  async function desistir() {
    // Arquivo ainda na fila receberia 409 depois da desistência e ficaria preso no aparelho.
    const subindo = envios.filter((e) => e.estado !== 'erro').length;
    if (subindo > 0) {
      setErros([`Aguarde: ${subindo} arquivo(s) ainda subindo. Desista depois que terminarem.`]);
      return;
    }
    setErros([]);
    setOcupado(true);
    try {
      const r = await acoes.desistir(devolucao.id, devolucao.codigo);
      if (r.ok) {
        router.push(r.destino);
        return;
      }
      setErros(r.erros);
    } catch {
      setErros(['Sem conexão. Tente de novo quando a internet voltar.']);
    } finally {
      setOcupado(false);
    }
  }

  const itemDoPasso = passo.tipo === 'item' ? itens.find((i) => i.id === passo.itemId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/fluxo/devolucoes/${devolucao.codigo}`} className={`${LINK_VOLTAR} self-start`}>
          ← {devolucao.codigo}
        </Link>
        <h1 className="text-xl font-bold">Conferência</h1>
        <p className="text-sm text-texto-2">
          <span className="font-mono">{devolucao.codigo}</span>
          {devolucao.rastreio && (
            <>
              {' · '}
              <span className="break-all font-mono">{devolucao.rastreio}</span>
            </>
          )}
        </p>
      </div>

      <ProgressoSegmentos passos={passos} atual={indice} completos={completos} />
      {aviso && (
        <p role="status" className={ALERTA_ATENCAO}>
          {aviso}
        </p>
      )}
      <ListaErros erros={erros} id={ID_ERROS} />

      {passo.tipo === 'pacote' && (
        <section aria-labelledby="titulo-pacote" className="flex flex-col gap-3">
          <h2 id="titulo-pacote" className="text-lg font-bold">
            Pacote
          </h2>
          {(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const).map((tipo) => (
            <SlotEvidencia
              key={tipo}
              titulo={ROTULO_EVIDENCIA[tipo]}
              descricao={DESCRICAO_EVIDENCIA[tipo]}
              estado={slot(tipo)}
              aoEscolher={(a) => void escolher(tipo, null, a)}
              aoTentarDeNovo={(id) => void tentarDeNovo(id)}
            />
          ))}
        </section>
      )}

      {passo.tipo === 'item' && itemDoPasso && (
        <PassoItem
          key={itemDoPasso.id}
          item={itemDoPasso}
          valor={valores[itemDoPasso.id]}
          ean={leituras[itemDoPasso.id]}
          slot={(tipo, itemId) => slot(tipo, itemId)}
          aoMudar={(parcial, salvarAgora) => mudar(itemDoPasso.id, parcial, salvarAgora)}
          aoConferirEan={(lido) => void conferirEan(itemDoPasso.id, lido)}
          aoEscolher={(tipo, a) => void escolher(tipo, itemDoPasso.id, a)}
          aoTentarDeNovo={(id) => void tentarDeNovo(id)}
        />
      )}

      {passo.tipo === 'video' && (
        <section aria-labelledby="titulo-video" className="flex flex-col gap-3">
          <h2 id="titulo-video" className="text-lg font-bold">
            Vídeo de Prova
          </h2>
          <p className="text-[15px] text-texto-2">
            {exigeVideo ? 'Obrigatório nesta devolução.' : 'Opcional nesta devolução (nenhuma unidade com problema ou ausente).'} Um vídeo contínuo,
            sem cortes, mostrando o teste de funcionamento ou o defeito. Grave em 1080p, com até 2 minutos.
          </p>
          <SlotEvidencia
            video
            titulo={ROTULO_EVIDENCIA.VIDEO_PROVA}
            descricao={DESCRICAO_EVIDENCIA.VIDEO_PROVA}
            estado={slot('VIDEO_PROVA')}
            aoEscolher={(a) => void escolher('VIDEO_PROVA', null, a)}
            aoTentarDeNovo={(id) => void tentarDeNovo(id)}
          />
        </section>
      )}

      {passo.tipo === 'destino' && (
        <PassoDestino
          itens={itens}
          valores={valores}
          divergentes={Object.fromEntries(itens.map((i) => [i.id, leituras[i.id]?.situacao === 'diverge']))}
          falta={falta}
          enviosPendentes={envios.length}
          aoMudar={mudar}
        />
      )}

      <div className="flex flex-col gap-2 pt-2">
        {confirmarDesistencia ? (
          <div className={`${ALERTA_ATENCAO} flex flex-col gap-2`}>
            <p className="text-[15px]">A devolução volta para &quot;Aguardando conferência&quot;. O que já foi feito fica guardado.</p>
            <button type="button" onClick={() => void desistir()} disabled={ocupado} className={BOTAO_PERIGO}>
              {ocupado ? 'Desistindo…' : 'Confirmar desistência'}
            </button>
            <button type="button" onClick={() => setConfirmarDesistencia(false)} disabled={ocupado} className={BOTAO_SECUNDARIO}>
              Continuar conferindo
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmarDesistencia(true)} className={BOTAO_PERIGO}>
            Desistir da conferência
          </button>
        )}
      </div>

      {/* Rodapé fixo logo acima da barra de abas (no computador, no fim da página). */}
      <div className="acima-barra sticky z-20 -mx-4 grid grid-cols-[auto_1fr] gap-2 border-t border-borda bg-superficie/95 px-4 py-3 sm:-mx-8 sm:px-8">
        <button type="button" onClick={() => irPara(indice - 1)} disabled={indice === 0 || ocupado} className={BOTAO_SECUNDARIO}>
          Voltar
        </button>
        {passo.tipo === 'destino' ? (
          <button type="button" onClick={() => void concluir()} disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {ocupado ? 'Concluindo…' : 'Concluir conferência'}
          </button>
        ) : (
          <button type="button" onClick={() => void continuar()} disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {ocupado ? 'Salvando…' : 'Continuar'}
          </button>
        )}
      </div>
    </div>
  );
}
