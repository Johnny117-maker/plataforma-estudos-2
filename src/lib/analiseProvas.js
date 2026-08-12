export function cruzarFrequencias(documentos) {
  const totalQuestoes = documentos.reduce((soma, doc) => soma + doc.questoes.length, 0);
  const grupos = new Map();
  documentos.forEach((doc) => {
    const vistosNoDocumento = new Set();
    doc.questoes.forEach((q) => {
      const materia = q.classificacao?.materia_nome || 'Não classificada';
      const assunto = q.classificacao?.assunto_nome || q.topico || 'Não classificado';
      const chave = `${materia}\u0000${assunto}`;
      const atual = grupos.get(chave) || { materia, assunto, questoes: 0, documentos: 0 };
      atual.questoes += 1;
      if (!vistosNoDocumento.has(chave)) {
        atual.documentos += 1;
        vistosNoDocumento.add(chave);
      }
      grupos.set(chave, atual);
    });
  });
  return [...grupos.values()]
    .map((item) => ({
      ...item,
      percentual: totalQuestoes ? item.questoes / totalQuestoes : 0,
      peso: documentos.length ? (item.questoes * item.documentos) / documentos.length : 0,
    }))
    .sort((a, b) => b.peso - a.peso || b.questoes - a.questoes);
}

/**
 * Cria unidades selecionáveis quando o documento não possui um padrão de
 * questões reconhecível. Os blocos ficam pequenos o suficiente para a Edge
 * Function classificar sem enviar o PDF original.
 */
export function criarBlocosDeConteudo(linhas, prefixo = 'conteudo', limite = 3000) {
  const blocos = [];
  let atual = [];
  let caracteres = 0;
  let pagina = 1;

  function concluir() {
    const texto = atual.join('\n').trim();
    if (!texto) return;
    const indice = blocos.length + 1;
    blocos.push({
      id: `${prefixo}-trecho-${indice}`,
      numero: null,
      pagina,
      enunciado: texto,
      alternativas: [],
      gabarito: null,
      topico: null,
      facilidade: null,
      apoio: [],
      caracteres: texto.length,
      dependeDeVisual: false,
      paraClassificar: texto,
      origem: 'trecho_extraido',
      selecionada: true,
    });
    atual = [];
    caracteres = 0;
  }

  for (const linha of linhas || []) {
    const partes = String(linha.texto || '').match(new RegExp(`.{1,${limite}}`, 'gs')) || [];
    for (const parteBruta of partes) {
      const parte = parteBruta.trim();
      if (!parte) continue;
      if (atual.length && caracteres + parte.length + 1 > limite) concluir();
      if (!atual.length) pagina = linha.pagina || 1;
      atual.push(parte);
      caracteres += parte.length + 1;
    }
  }
  concluir();
  return blocos;
}

/** Retorna somente arquivos e conteúdos escolhidos pelo usuário. */
export function filtrarSelecao(documentos) {
  return (documentos || [])
    .filter((doc) => doc.selecionado !== false)
    .map((doc) => {
      const questoes = (doc.questoes || []).filter(
        (questao) => questao.selecionada !== false && String(questao.paraClassificar || questao.enunciado || '').trim()
      );
      return {
        ...doc,
        questoes,
        // A persistência recebe apenas o texto escolhido, nunca o conteúdo
        // integral de um arquivo parcialmente selecionado.
        texto: questoes.map((questao) => questao.paraClassificar || questao.enunciado).join('\n\n'),
      };
    })
    .filter((doc) => doc.questoes.length > 0);
}

export function resumirSelecao(documentos) {
  const selecionados = filtrarSelecao(documentos);
  const conteudos = selecionados.flatMap((doc) => doc.questoes);
  return {
    documentos: selecionados.length,
    conteudos: conteudos.length,
    classificados: conteudos.filter((item) => item.classificacao).length,
  };
}

export function serializarDocumentos(documentos) {
  return documentos.map((doc) => ({
    nome_arquivo: doc.nome,
    tipo_arquivo: doc.tipo,
    tamanho_bytes: doc.tamanho,
    hash_sha256: doc.hash,
    perfil: doc.perfil,
    total_paginas: doc.totalPaginas,
    texto_extraido: doc.texto,
    avisos: doc.avisos,
    questoes: doc.questoes.map((q) => ({
      numero: q.numero,
      pagina: q.pagina,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      resposta_correta: q.gabarito,
      materia_id: q.classificacao?.materia_id || null,
      subgenero_id: q.classificacao?.subgenero_id || null,
      materia_nome: q.classificacao?.materia_nome || 'Não classificada',
      assunto_nome: q.classificacao?.assunto_nome || q.topico || 'Não classificado',
      dificuldade: q.classificacao?.dificuldade || 'media',
      confianca: q.classificacao?.confianca ?? null,
      depende_de_visual: q.dependeDeVisual,
      metadados: {
        origem: q.origem || 'questao_detectada',
        topico: q.topico,
        facilidade: q.facilidade,
        apoio: q.apoio?.map((a) => a.rotulo) || [],
        visual_analisado: Boolean(q.visualAnalisado),
        descricao_visual: q.descricaoVisual || null,
        modelo_visual: q.modeloVisual || null,
        imagem_storage_path: q.imagemStoragePath || null,
      },
    })),
  }));
}
