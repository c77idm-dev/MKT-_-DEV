export const API_ML = 'https://api.mercadolibre.com';

export class ErroML extends Error {
  readonly status: number;
  readonly corpo: string;
  readonly caminho: string;

  constructor(status: number, corpo: string, caminho: string) {
    super(`Mercado Livre respondeu ${status} em ${caminho}`);
    this.name = 'ErroML';
    this.status = status;
    this.corpo = corpo;
    this.caminho = caminho;
  }
}

export type ClienteML = {
  get<T = unknown>(caminho: string, cabecalhos?: Record<string, string>): Promise<T>;
};

export function criarClienteML(p: { accessToken: string; fetchFn?: typeof fetch }): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  return {
    async get<T = unknown>(caminho: string, cabecalhos: Record<string, string> = {}): Promise<T> {
      const resposta = await fetchFn(`${API_ML}${caminho}`, {
        headers: { accept: 'application/json', ...cabecalhos, authorization: `Bearer ${p.accessToken}` },
      });
      const texto = await resposta.text();
      if (!resposta.ok) throw new ErroML(resposta.status, texto, caminho);
      if (!texto) return null as T;
      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new ErroML(resposta.status, texto, caminho);
      }
    },
  };
}
