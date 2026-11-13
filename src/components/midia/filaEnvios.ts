import type { TipoEvidencia } from '@/modules/midia/dominio';

export type EstadoEnvio = 'pendente' | 'enviando' | 'erro';

export type RegistroEnvio = {
  idCliente: string;
  devolucaoId: string;
  itemId: string | null;
  tipo: TipoEvidencia;
  nome: string;
  tipoConteudo: string;
  tamanho: number;
  arquivo: Blob;
  criadoEm: number;
  tentativas: number;
  proximaTentativaEm: number;
  estado: EstadoEnvio;
  /** URL do upload no tus: com ela o envio continua de onde parou. */
  uploadUrl: string | null;
  mensagem: string | null;
  /** 0 a 1, só enquanto envia (fica em memória). */
  progresso: number;
};

export type NovoEnvio = Pick<RegistroEnvio, 'idCliente' | 'devolucaoId' | 'itemId' | 'tipo' | 'nome' | 'tipoConteudo' | 'arquivo'>;

export interface ArmazemFila {
  listar(): Promise<RegistroEnvio[]>;
  gravar(r: RegistroEnvio): Promise<void>;
  apagar(idCliente: string): Promise<void>;
}

/** Para os testes. */
export class ArmazemMemoria implements ArmazemFila {
  private readonly registros = new Map<string, RegistroEnvio>();
  async listar() {
    return [...this.registros.values()];
  }
  async gravar(r: RegistroEnvio) {
    this.registros.set(r.idCliente, r);
  }
  async apagar(idCliente: string) {
    this.registros.delete(idCliente);
  }
}

export type ResultadoTransporte = { ok: true; evidenciaId: string } | { ok: false; definitivo: boolean; mensagem: string };
export type Transporte = (r: RegistroEnvio, eventos: { aoProgresso(fracao: number): void; aoUrl(url: string): void }) => Promise<ResultadoTransporte>;
export type EnvioConcluido = { idCliente: string; devolucaoId: string; itemId: string | null; tipo: TipoEvidencia; evidenciaId: string };

const SEM_CONEXAO = 'Sem conexão com o servidor. Tentando de novo…';

/** 2 s, 4 s, 8 s... até 5 min, com ±20% de sorteio para os celulares não tentarem todos juntos (pesquisa §4). */
export function proximaEspera(tentativas: number, sorteio: number = Math.random()): number {
  const base = Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, tentativas - 1));
  return Math.round(base * (0.8 + 0.4 * sorteio));
}

/**
 * Fila de envios do aparelho. Um envio por vez, do mais antigo para o mais novo. Falha passageira (rede, 5xx):
 * espera crescente e para a rodada (sem rede, não adianta tentar os outros). Recusa definitiva: fica com erro até
 * a pessoa tocar "Tentar de novo" ou tirar de novo.
 */
export class FilaEnvios {
  private rodada: Promise<void> | null = null;
  private forcarDeNovo = false;
  private readonly progresso = new Map<string, number>();
  /** O IndexedDB devolve um Blob novo a cada leitura; guardar o primeiro evita recriar a miniatura a cada atualização. */
  private readonly arquivos = new Map<string, Blob>();
  private readonly ouvintes = new Set<() => void>();
  private readonly ouvintesConcluidos = new Set<(e: EnvioConcluido) => void>();

  constructor(
    private readonly armazem: ArmazemFila,
    private readonly transporte: Transporte,
    private readonly relogio: () => number = Date.now,
    private readonly sorteio: () => number = Math.random,
  ) {}

  aoMudar(f: () => void): () => void {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  aoConcluir(f: (e: EnvioConcluido) => void): () => void {
    this.ouvintesConcluidos.add(f);
    return () => this.ouvintesConcluidos.delete(f);
  }

  private avisar() {
    for (const f of this.ouvintes) f();
  }

  async listar(): Promise<RegistroEnvio[]> {
    const lista = await this.armazem.listar();
    return lista
      .map((r) => {
        const arquivo = this.arquivos.get(r.idCliente) ?? r.arquivo;
        this.arquivos.set(r.idCliente, arquivo);
        return { ...r, arquivo, progresso: this.progresso.get(r.idCliente) ?? r.progresso };
      })
      .sort((a, b) => a.criadoEm - b.criadoEm);
  }

  /** Grava no aparelho primeiro; depois tenta enviar. */
  async adicionar(novo: NovoEnvio): Promise<void> {
    await this.armazem.gravar({
      ...novo,
      tamanho: novo.arquivo.size,
      criadoEm: this.relogio(),
      tentativas: 0,
      proximaTentativaEm: 0,
      estado: 'pendente',
      uploadUrl: null,
      mensagem: null,
      progresso: 0,
    });
    this.avisar();
    void this.processar();
  }

  /** `forcar`: tenta na hora o que está esperando (a rede voltou). Se já há uma rodada, devolve a mesma. */
  processar(forcar = false): Promise<void> {
    if (this.rodada) {
      if (forcar) this.forcarDeNovo = true;
      return this.rodada;
    }
    this.rodada = (async () => {
      try {
        let f = forcar;
        do {
          this.forcarDeNovo = false;
          await this.rodar(f);
          f = true;
        } while (this.forcarDeNovo);
      } finally {
        this.rodada = null;
      }
    })();
    return this.rodada;
  }

  private async rodar(forcar: boolean): Promise<void> {
    const enviados = new Set<string>();
    for (;;) {
      const agora = this.relogio();
      const proximo = (await this.listar()).find(
        (r) => r.estado !== 'erro' && !enviados.has(r.idCliente) && (forcar || r.proximaTentativaEm <= agora),
      );
      if (!proximo) return;
      enviados.add(proximo.idCliente);
      if (!(await this.enviar(proximo))) return;
    }
  }

  /** true = pode seguir para o próximo; false = falha passageira (para a rodada). */
  private async enviar(r: RegistroEnvio): Promise<boolean> {
    let uploadUrl = r.uploadUrl;
    await this.armazem.gravar({ ...r, estado: 'enviando', mensagem: null, progresso: 0 });
    this.avisar();
    let resultado: ResultadoTransporte;
    try {
      resultado = await this.transporte(
        { ...r, estado: 'enviando' },
        {
          aoProgresso: (fracao) => {
            this.progresso.set(r.idCliente, fracao);
            this.avisar();
          },
          aoUrl: (url) => {
            uploadUrl = url;
            void this.armazem.gravar({ ...r, estado: 'enviando', uploadUrl: url, mensagem: null, progresso: 0 });
          },
        },
      );
    } catch {
      resultado = { ok: false, definitivo: false, mensagem: SEM_CONEXAO };
    }
    this.progresso.delete(r.idCliente);
    if (resultado.ok) {
      await this.armazem.apagar(r.idCliente);
      this.arquivos.delete(r.idCliente);
      this.avisar();
      const concluido = { idCliente: r.idCliente, devolucaoId: r.devolucaoId, itemId: r.itemId, tipo: r.tipo, evidenciaId: resultado.evidenciaId };
      for (const f of this.ouvintesConcluidos) f(concluido);
      return true;
    }
    if (resultado.definitivo) {
      await this.armazem.gravar({ ...r, estado: 'erro', uploadUrl, mensagem: resultado.mensagem, progresso: 0 });
      this.avisar();
      return true;
    }
    const tentativas = r.tentativas + 1;
    await this.armazem.gravar({
      ...r,
      estado: 'pendente',
      uploadUrl,
      tentativas,
      proximaTentativaEm: this.relogio() + proximaEspera(tentativas, this.sorteio()),
      mensagem: resultado.mensagem,
      progresso: 0,
    });
    this.avisar();
    return false;
  }

  async tentarDeNovo(idCliente: string): Promise<void> {
    const r = (await this.armazem.listar()).find((x) => x.idCliente === idCliente);
    if (!r) return;
    await this.armazem.gravar({ ...r, estado: 'pendente', proximaTentativaEm: 0, mensagem: null });
    this.avisar();
    await this.processar(true);
  }

  async descartar(idCliente: string): Promise<void> {
    await this.armazem.apagar(idCliente);
    this.arquivos.delete(idCliente);
    this.avisar();
  }
}
