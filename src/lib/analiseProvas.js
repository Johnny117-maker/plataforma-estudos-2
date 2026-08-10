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
      metadados: { topico: q.topico, facilidade: q.facilidade, apoio: q.apoio?.map((a) => a.rotulo) || [] },
    })),
  }));
}
