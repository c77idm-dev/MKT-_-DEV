import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ArmazenamentoS3, criarClienteS3 } from './armazenamento-s3';
import { ErroArquivoNaoEncontrado } from './erros';

function montar() {
  const cliente = criarClienteS3({
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    regiao: 'us-west-004',
    bucket: 'midias',
    chaveId: 'id-de-teste',
    chaveSecreta: 'segredo-de-teste',
  });
  const send = vi.spyOn(cliente, 'send');
  return { send, a: new ArmazenamentoS3(cliente, 'midias') };
}
const naoExiste = Object.assign(new Error('não existe'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });

describe('ArmazenamentoS3 (B2/R2), sem rede', () => {
  it('salvar com tamanho manda o stream com ContentLength e ContentType', async () => {
    const { send, a } = montar();
    send.mockResolvedValue({} as never);
    const corpo = Readable.from([Buffer.from('abc')]);
    await a.salvar('evidencias/d/e.jpg', corpo, { tipoConteudo: 'image/jpeg', tamanho: 3 });
    const comando = send.mock.calls[0][0] as PutObjectCommand;
    expect(comando).toBeInstanceOf(PutObjectCommand);
    expect(comando.input).toMatchObject({ Bucket: 'midias', Key: 'evidencias/d/e.jpg', ContentType: 'image/jpeg', ContentLength: 3, Body: corpo });
  });

  it('salvar sem tamanho junta o conteúdo e manda o Buffer', async () => {
    const { send, a } = montar();
    send.mockResolvedValue({} as never);
    await a.salvar('nfe/2026/11/n.xml', Readable.from([Buffer.from('<x/>')]));
    const comando = send.mock.calls[0][0] as PutObjectCommand;
    expect(comando.input.ContentLength).toBe(4);
    expect(Buffer.isBuffer(comando.input.Body)).toBe(true);
  });

  it('ler o que não existe lança ErroArquivoNaoEncontrado', async () => {
    const { send, a } = montar();
    send.mockRejectedValue(naoExiste as never);
    await expect(a.ler('evidencias/x.jpg')).rejects.toThrow(ErroArquivoNaoEncontrado);
  });

  it('existe e apagar', async () => {
    const { send, a } = montar();
    send.mockResolvedValueOnce({} as never).mockRejectedValueOnce(naoExiste as never).mockResolvedValueOnce({} as never);
    expect(await a.existe('evidencias/a.jpg')).toBe(true);
    expect(await a.existe('evidencias/b.jpg')).toBe(false);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    await a.apagar('evidencias/a.jpg');
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('link temporário assinado de 10 minutos (spec §9), sem falar com o serviço', async () => {
    const { send, a } = montar();
    const url = new URL(await a.urlTemporaria('evidencias/d/e.jpg', 600));
    expect(url.host).toBe('s3.us-west-004.backblazeb2.com');
    expect(url.pathname).toBe('/midias/evidencias/d/e.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(send).not.toHaveBeenCalled();
  });

  it('recusa chave perigosa', async () => {
    const { a } = montar();
    await expect(a.urlTemporaria('../fora', 600)).rejects.toThrow();
  });
});
