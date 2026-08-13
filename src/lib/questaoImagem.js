// Captura de figuras, gráficos e diagramas do PDF da prova.
//
// O fluxo procura, em ordem:
//
//   1. Objetos raster (imagens embutidas) dentro da região da questão.
//   2. Uma "faixa vetorial": o maior espaço em branco entre linhas de texto,
//      que costuma corresponder ao gráfico desenhado como vetor.
//   3. Como último recurso, a região textual completa da questão — assim uma
//      tabela ou diagrama incomum nunca desaparece da importação.
//
// As duas opções `preferirPainelCompleto` e `fallbackQuestaoCompleta` passam a
// ser `true` por padrão. Antes, a tela de "Analisar provas" chamava esta
// função sem opções, o que fazia o fluxo parar no passo 1 e devolver zero
// recortes para provas em que gráficos e tabelas são desenhados como vetor
// puro (o caso da FATEC 2026: radares, fórmulas químicas, mapas, tabelas em
// quadro). A importação manual sempre passou os dois `true` explicitamente e
// funcionava; agora o padrão é o mesmo comportamento robusto para todos os
// chamadores.

import { supabase } from '../supabaseClient';
export { criarRecortesOrigem } from './recortesQuestao.js';
import {
  criarRegioesCapturaRaster,
  extrairRegioesRaster,
  incluirRegioesRelacionadas,
  regiaoPertenceAQuestao,
} from './regioesImagemPdf.js';
import { criarCaminhoImagemQuestao } from './identidadeImagem.js';

export const BUCKET_IMAGENS_QUESTOES = 'questoes-imagens';

const ESCALA_RENDER = 2;

function canvasParaBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a figura da questão.'))),
      'image/webp',
      0.9
    );
  });
}

function recortarPagina(canvasPagina, viewport, recorte) {
  const [ax, ay, bx, by] = viewport.convertToViewportRectangle([
    recorte.x0,
    recorte.y0,
    recorte.x1,
    recorte.y1,
  ]);
  const x = Math.max(0, Math.floor(Math.min(ax, bx)));
  const y = Math.max(0, Math.floor(Math.min(ay, by)));
  const largura = Math.max(1, Math.min(canvasPagina.width - x, Math.ceil(Math.abs(bx - ax))));
  const altura = Math.max(1, Math.min(canvasPagina.height - y, Math.ceil(Math.abs(by - ay))));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext('2d', { alpha: false });
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, largura, altura);
  contexto.drawImage(canvasPagina, x, y, largura, altura, 0, 0, largura, altura);
  return canvas;
}

function juntarPartes(partes) {
  if (partes.length === 1) return partes[0].canvas;
  const intervalo = 12;
  const largura = Math.max(...partes.map((parte) => parte.canvas.width));
  const altura = partes.reduce((soma, parte) => soma + parte.canvas.height, 0)
    + intervalo * (partes.length - 1);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext('2d', { alpha: false });
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, largura, altura);
  let y = 0;
  for (const parte of partes) {
    const x = Math.round((largura - parte.canvas.width) / 2);
    contexto.drawImage(parte.canvas, x, y);
    y += parte.canvas.height + intervalo;
  }
  return canvas;
}

function escolherLacunaVisual(questao, pagina) {
  return (questao.lacunasVisuaisOrigem || [])
    .filter((regiao) => regiao.pagina === pagina)
    .sort((a, b) => b.area - a.area)[0] || null;
}

function unirPainelVisual(regioes, tipoCaptura = 'painel_visual_completo') {
  const validas = (regioes || []).filter(Boolean);
  if (!validas.length) return null;
  const base = validas[0];
  const x0 = Math.min(...validas.map((regiao) => regiao.x0));
  const x1 = Math.max(...validas.map((regiao) => regiao.x1));
  const y0 = Math.min(...validas.map((regiao) => regiao.y0));
  const y1 = Math.max(...validas.map((regiao) => regiao.y1));
  return {
    ...base,
    x0,
    x1,
    y0,
    y1,
    largura: x1 - x0,
    altura: y1 - y0,
    tipoCaptura,
  };
}

/**
 * Extrai figuras, gráficos e diagramas associados à questão. Imagens raster
 * usam a posição exata do objeto no PDF; elementos vetoriais usam a maior
 * faixa gráfica existente entre os trechos de texto. Se nada disso funcionar,
 * captura a região completa da questão como último recurso.
 *
 * Opções:
 *  - `preferirPainelCompleto` (padrão: true) — quando a questão tem gráficos
 *    e ícones desenhados como vetor, une tudo num único painel em vez de
 *    escolher um objeto isolado. Essencial para painéis com vários gráficos.
 *  - `fallbackQuestaoCompleta` (padrão: true) — quando nem raster nem lacuna
 *    aparecem, captura a região textual da questão. Impede que uma questão
 *    marcada como visual desapareça silenciosamente da importação.
 */
export async function capturarImagensQuestoesPdf(arquivo, questoes, onProgresso, opcoes = {}) {
  const {
    preferirPainelCompleto = true,
    fallbackQuestaoCompleta = true,
  } = opcoes;
  const alvos = (questoes || []).filter((questao) => (
    questao.id && questao.dependeDeVisual && questao.recortesOrigem?.length
  ));
  if (!alvos.length) return [];

  const pdfjsLib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default || worker;
  const doc = await pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const porPagina = new Map();
  const partes = new Map(alvos.map((questao) => [String(questao.id), []]));

  for (const questao of alvos) {
    for (const pagina of new Set(questao.recortesOrigem.map((recorte) => recorte.pagina))) {
      const lista = porPagina.get(pagina) || [];
      lista.push(questao);
      porPagina.set(pagina, lista);
    }
  }

  const paginas = [...porPagina.entries()].sort((a, b) => a[0] - b[0]);
  try {
    for (let indice = 0; indice < paginas.length; indice += 1) {
      const [numeroPagina, questoesPagina] = paginas[indice];
      onProgresso?.(indice + 1, paginas.length, numeroPagina);
      const page = await doc.getPage(numeroPagina);
      const [, , larguraPagina, alturaPagina] = page.view;
      const operadores = await page.getOperatorList();
      const regioesRaster = extrairRegioesRaster(
        operadores.fnArray,
        operadores.argsArray,
        pdfjsLib.OPS
      ).map((regiao) => ({ ...regiao, pagina: numeroPagina, larguraPagina, alturaPagina }));
      const pedidos = [];

      for (const questao of questoesPagina) {
        const recortes = questao.recortesOrigem.filter((recorte) => recorte.pagina === numeroPagina);
        const rasterDireto = regioesRaster
          .filter((regiao) => regiaoPertenceAQuestao(regiao, recortes));
        const rasterAssociado = incluirRegioesRelacionadas(rasterDireto, regioesRaster);
        const regioesRasterCaptura = criarRegioesCapturaRaster(rasterAssociado);
        const lacuna = questao.dependeDeVisual
          ? escolherLacunaVisual(questao, numeroPagina)
          : null;
        let regioes = regioesRasterCaptura;

        // A faixa vetorial e todos os objetos raster associados formam um
        // único painel. É isso que impede um ícone periférico (por exemplo,
        // o jogador ilustrado ao lado do gráfico) de substituir o gráfico.
        if (preferirPainelCompleto && questao.alternativasRepresentadasNaImagem && recortes.length) {
          const painel = unirPainelVisual(recortes, 'questao_visual_completa');
          regioes = painel ? [painel] : [];
        } else if (preferirPainelCompleto && lacuna) {
          // Sem raster, a união das faixas da questão é mais confiável do que
          // uma única lacuna: painéis com cinco gráficos costumam ter rótulos
          // de texto que dividem o desenho em várias lacunas menores.
          const bases = regioesRasterCaptura.length
            ? [...regioesRasterCaptura, lacuna]
            : recortes;
          const painel = unirPainelVisual(bases, 'painel_visual_completo');
          regioes = painel ? [painel] : [];
        } else if (!regioes.length && lacuna) {
          regioes = [{ ...lacuna, tipoCaptura: 'faixa_vetorial' }];
        }

        // Último recurso seguro: captura a região completa já atribuída à
        // questão. Assim uma tabela ou diagrama incomum nunca faz a questão
        // desaparecer da importação por não ser um objeto raster isolável.
        if (!regioes.length && fallbackQuestaoCompleta && questao.dependeDeVisual) {
          regioes = recortes.map((recorte) => ({
            ...recorte,
            tipoCaptura: 'questao_visual_completa',
          }));
        }

        regioes
          .sort((a, b) => b.y1 - a.y1)
          .forEach((recorte, ordem) => pedidos.push({
            questaoId: String(questao.id),
            recorte,
            ordem: numeroPagina * 10_000 + ordem,
          }));
      }

      if (!pedidos.length) {
        page.cleanup();
        continue;
      }
      const viewport = page.getViewport({ scale: ESCALA_RENDER });
      const canvasPagina = document.createElement('canvas');
      canvasPagina.width = Math.ceil(viewport.width);
      canvasPagina.height = Math.ceil(viewport.height);
      const contexto = canvasPagina.getContext('2d', { alpha: false });
      await page.render({ canvasContext: contexto, viewport }).promise;

      for (const pedido of pedidos) {
        partes.get(pedido.questaoId).push({
          ordem: pedido.ordem,
          tipoCaptura: pedido.recorte.tipoCaptura,
          canvas: recortarPagina(canvasPagina, viewport, pedido.recorte),
        });
      }
      page.cleanup();
    }

    const saida = [];
    for (const questao of alvos) {
      const pedacos = partes.get(String(questao.id)).sort((a, b) => a.ordem - b.ordem);
      if (!pedacos.length) continue;
      const canvas = juntarPartes(pedacos);
      saida.push({
        id: String(questao.id),
        numero: questao.numero,
        blob: await canvasParaBlob(canvas),
        largura: canvas.width,
        altura: canvas.height,
        tipoCaptura: [...new Set(pedacos.map((pedaco) => pedaco.tipoCaptura))].join('+'),
      });
    }
    return saida;
  } finally {
    await doc.destroy();
  }
}

export async function salvarCapturasQuestoes(hashDocumento, capturas, onProgresso) {
  if (!capturas?.length) return new Map();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw new Error('Sessão inválida para salvar as imagens das questões.');
  const usuarioId = authData.user.id;
  const resultados = new Map();

  for (let indice = 0; indice < capturas.length; indice += 1) {
    const captura = capturas[indice];
    onProgresso?.(indice + 1, capturas.length, captura);
    const caminho = await criarCaminhoImagemQuestao(usuarioId, hashDocumento, captura);
    const { error } = await supabase.storage
      .from(BUCKET_IMAGENS_QUESTOES)
      .upload(caminho, captura.blob, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(`Falha ao salvar a figura da questão ${captura.numero || ''}: ${error.message}`);

    const { data: assinatura } = await supabase.storage
      .from(BUCKET_IMAGENS_QUESTOES)
      .createSignedUrl(caminho, 60 * 60);
    resultados.set(String(captura.id), {
      imagemStoragePath: caminho,
      imagemPreviewUrl: assinatura?.signedUrl || URL.createObjectURL(captura.blob),
      imagemLargura: captura.largura,
      imagemAltura: captura.altura,
      imagemTipoCaptura: captura.tipoCaptura || null,
    });
  }
  return resultados;
}

export async function salvarImagensPendentes(documentos, onProgresso) {
  const saida = [...(documentos || [])];
  for (let indice = 0; indice < saida.length; indice += 1) {
    const documento = saida[indice];
    const pendentes = (documento.questoes || [])
      .filter((questao) => questao.imagemBlob && !questao.imagemStoragePath)
      .map((questao) => ({
        id: questao.id,
        numero: questao.numero,
        blob: questao.imagemBlob,
        largura: questao.imagemLargura,
        altura: questao.imagemAltura,
        tipoCaptura: questao.imagemTipoCaptura,
      }));
    if (!pendentes.length) continue;
    onProgresso?.(documento, pendentes.length);
    const salvas = await salvarCapturasQuestoes(documento.hash, pendentes);
    saida[indice] = {
      ...documento,
      questoes: documento.questoes.map((questao) => {
        const imagem = salvas.get(String(questao.id));
        return imagem ? { ...questao, ...imagem, imagemBlob: undefined } : questao;
      }),
    };
  }
  return saida;
}

function caminhoPrivado(valor) {
  return Boolean(valor) && !/^(?:https?:|data:|blob:)/i.test(String(valor));
}

/** Troca caminhos privados por URLs temporárias somente para exibição. */
export async function assinarImagensPerguntas(perguntas, validadeSegundos = 60 * 60) {
  const caminhos = [...new Set((perguntas || []).map((pergunta) => pergunta.imagem_url).filter(caminhoPrivado))];
  if (!caminhos.length) return perguntas || [];
  const { data, error } = await supabase.storage
    .from(BUCKET_IMAGENS_QUESTOES)
    .createSignedUrls(caminhos, validadeSegundos);
  if (error) return perguntas || [];
  const urls = new Map((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
  return (perguntas || []).map((pergunta) => ({
    ...pergunta,
    imagem_assinada_url: caminhoPrivado(pergunta.imagem_url)
      ? urls.get(pergunta.imagem_url) || null
      : pergunta.imagem_url || null,
  }));
}

/** Remove, em lotes, somente caminhos que pertencem ao usuário autenticado. */
export async function removerImagensQuestoes(caminhos) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw new Error('Sessão inválida para remover as imagens das questões.');
  const prefixo = `${authData.user.id}/`;
  const validos = [...new Set((caminhos || [])
    .map(String)
    .filter((caminho) => caminho.startsWith(prefixo) && !caminho.includes('..')))];
  for (let indice = 0; indice < validos.length; indice += 100) {
    const { error } = await supabase.storage
      .from(BUCKET_IMAGENS_QUESTOES)
      .remove(validos.slice(indice, indice + 100));
    if (error) throw new Error(error.message);
  }
  return validos.length;
}

async function listarArquivosPasta(prefixo) {
  const arquivos = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET_IMAGENS_QUESTOES)
      .list(prefixo, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(error.message);
    const itens = data || [];
    for (const item of itens) {
      const caminho = `${prefixo}/${item.name}`;
      if (item.id) arquivos.push(caminho);
      else arquivos.push(...await listarArquivosPasta(caminho));
    }
    if (itens.length < 1000) break;
    offset += itens.length;
  }
  return arquivos;
}

/** Inclui arquivos órfãos que nunca chegaram a ser vinculados à pergunta. */
export async function removerTodasImagensQuestoes() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw new Error('Sessão inválida para remover as imagens das questões.');
  const arquivos = await listarArquivosPasta(authData.user.id);
  return removerImagensQuestoes(arquivos);
}