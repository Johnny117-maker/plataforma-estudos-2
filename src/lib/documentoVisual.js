export function aplicarDescricoesVisuais(questoes, descricoes, modelo = 'gemini-3.5-flash-lite') {
  const porNumero = new Map(
    (descricoes || [])
      .map((item) => [Number(item?.numero), String(item?.descricao || '').trim()])
      .filter(([numero, descricao]) => Number.isInteger(numero) && descricao)
  );
  let aplicadas = 0;
  const resultado = (questoes || []).map((questao) => {
    const descricao = porNumero.get(Number(questao.numero));
    if (!descricao) return questao;
    aplicadas += 1;
    const original = String(questao.paraClassificar || questao.enunciado || '').trim();
    return {
      ...questao,
      descricaoVisual: descricao,
      visualAnalisado: true,
      modeloVisual: modelo,
      // A descrição vem antes porque o classificador limita o tamanho do texto.
      paraClassificar: [`[Descrição visual: ${descricao}]`, original].filter(Boolean).join('\n'),
    };
  });
  return { questoes: resultado, aplicadas };
}
