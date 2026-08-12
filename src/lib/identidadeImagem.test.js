import { describe, expect, it } from 'vitest';
import { criarCaminhoImagemQuestao } from './identidadeImagem';

describe('identidade da imagem da questão', () => {
  it('mantém o caminho quando o conteúdo é idêntico', async () => {
    const captura = { numero: 7, blob: new Blob(['grafico-completo']) };
    const caminhoA = await criarCaminhoImagemQuestao('usuario', 'prova 2026', captura);
    const caminhoB = await criarCaminhoImagemQuestao('usuario', 'prova 2026', captura);

    expect(caminhoA).toBe(caminhoB);
    expect(caminhoA).toMatch(/^usuario\/prova-2026\/questao-007-[a-f0-9]{16}\.webp$/);
  });

  it('troca o caminho quando o recorte é corrigido', async () => {
    const antigo = await criarCaminhoImagemQuestao('usuario', 'prova', {
      numero: 7,
      blob: new Blob(['figura-do-jogador']),
    });
    const corrigido = await criarCaminhoImagemQuestao('usuario', 'prova', {
      numero: 7,
      blob: new Blob(['graficos-de-radar-completos']),
    });

    expect(corrigido).not.toBe(antigo);
  });
});
