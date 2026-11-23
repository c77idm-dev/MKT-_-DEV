// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FotoProduto } from './FotoProduto';

const URL_FOTO = 'https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg';

describe('FotoProduto (produtos do ML, extra)', () => {
  it('com foto: quadrado fixo, arredondado, object-cover, lazy, sem referer e alt com a descrição', () => {
    render(<FotoProduto url={URL_FOTO} descricao="Fone de Ouvido Bluetooth" />);
    const img = screen.getByRole('img', { name: 'Fone de Ouvido Bluetooth' });
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe(URL_FOTO);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    for (const classe of ['size-11', 'shrink-0', 'rounded-lg', 'object-cover']) expect(img.className).toContain(classe);
  });

  it('sem foto: ícone neutro no mesmo tamanho, sem <img>', () => {
    for (const url of [null, undefined, '']) {
      const { container, unmount } = render(<FotoProduto url={url} descricao="Fone" tamanho="m" />);
      const vazio = screen.getByRole('img', { name: 'Sem foto do produto' });
      expect(vazio.tagName).toBe('SPAN');
      expect(vazio.className).toContain('size-16');
      expect(container.querySelector('img')).toBeNull();
      unmount();
    }
  });

  it('a imagem que não carrega vira o ícone (nunca imagem quebrada)', () => {
    const { container } = render(<FotoProduto url={URL_FOTO} descricao="Fone" />);
    fireEvent.error(screen.getByRole('img', { name: 'Fone' }));
    expect(screen.getByRole('img', { name: 'Sem foto do produto' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('uma foto nova depois de um erro aparece de novo', () => {
    const { rerender } = render(<FotoProduto url={URL_FOTO} descricao="Fone" />);
    fireEvent.error(screen.getByRole('img', { name: 'Fone' }));
    const outra = 'https://http2.mlstatic.com/D_622222-MLB70000000002_072026-O.jpg';
    rerender(<FotoProduto url={outra} descricao="Fone" />);
    expect(screen.getByRole('img', { name: 'Fone' }).getAttribute('src')).toBe(outra);
  });

  it('tamanhos: p 44 px, m 64 px, g 128 px', () => {
    for (const [tamanho, classe] of [['p', 'size-11'], ['m', 'size-16'], ['g', 'size-32']] as const) {
      const { unmount } = render(<FotoProduto url={URL_FOTO} descricao="Fone" tamanho={tamanho} />);
      expect(screen.getByRole('img', { name: 'Fone' }).className).toContain(classe);
      unmount();
    }
  });
});
