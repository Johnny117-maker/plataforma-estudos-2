// Dados extraídos dos 4 painéis HTML originais, reestruturados no formato
// que o importador entende: cronograma -> fases -> semanas -> tarefas.
// As datas não existem nos HTMLs originais (eles calculavam "dias restantes"
// dinamicamente) — o importador recalcula data_inicio/data_prazo de cada
// fase e cada tarefa a partir de hoje, indo semana a semana.

export const PL300_PLAN = {
  nome: 'PL-300',
  cor: '#F2C811',
  diasAteAlvo: 90,
  ritmoHorasDia: 1.5,
  fases: [
    {
      nome: 'Preparar os Dados', cor: '#F2C811', peso: '25–30%',
      semanas: [
        { titulo: 'Obter Dados', tarefas: ['Conectar-se ao SQL, arquivos planos e pastas', 'Selecionar o modo de armazenamento adequado', 'Usar o Microsoft Dataverse'] },
        { titulo: 'Limpar e Transformar', tarefas: ['Resolver inconsistências e erros de tipo', 'Substituir nulos e perfilar dados', 'Mesclar e acrescentar consultas no Power Query'] },
        { titulo: 'Transformações Avançadas', tarefas: ['Parâmetros e funções personalizadas em M', 'Tratar convenções de nomenclatura', 'Preparar dados para o modelo em estrela'] },
      ],
    },
    {
      nome: 'Modelar os Dados', cor: '#2F81F7', peso: '25–30%',
      semanas: [
        { titulo: 'Desenvolver o Modelo', tarefas: ['Projetar tabelas de fato e dimensão', 'Configurar cardinalidade de relacionamentos', 'Implementar Segurança em Nível de Linha (RLS)'] },
        { titulo: 'Expressões DAX - Base', tarefas: ['Diferenciar colunas calculadas e medidas', 'Criar medidas de agregação simples', 'Funções de iteração (SUMX, AVERAGEX)'] },
        { titulo: 'DAX Inteligência de Tempo', tarefas: ['Criar e configurar tabela de calendário', 'Funções DATEADD, SAMEPERIODLASTYEAR', 'Funções YTD, MTD, QTD e CALCULATE'] },
      ],
    },
    {
      nome: 'Visualizar e Analisar', cor: '#238636', peso: '25–30%',
      semanas: [
        { titulo: 'Criar Relatórios visuais', tarefas: ['Selecionar o visual adequado (barras, linhas, dispersão)', 'Formatar condicionalmente os visuais', 'Usar dicas de ferramentas (Tooltips) personalizadas'] },
        { titulo: 'Navegação e Dashboards', tarefas: ['Configurar Indicadores (Bookmarks) e botões', 'Criar dashboards no Power BI Service', 'Projetar relatórios para dispositivos móveis'] },
        { titulo: 'Análise Avançada e IA', tarefas: ['Agrupamento e compartimentalização (Binning)', 'Visuais de Influenciadores Principais e Árvore de Decomposição', 'Visual de Perguntas e Respostas (Q&A)'] },
      ],
    },
    {
      nome: 'Implantar e Manter', cor: '#A371F7', peso: '15–20%',
      semanas: [
        { titulo: 'Gerenciar Workspaces', tarefas: ['Criar workspaces e atribuir funções', 'Publicar, importar e atualizar ativos', 'Criar e gerenciar Aplicativos (Apps)'] },
        { titulo: 'Conjuntos de Dados', tarefas: ['Configurar gateway de dados', 'Agendar atualização de dados', 'Promover e certificar conjuntos de dados (Endorsement)'] },
      ],
    },
    {
      nome: 'Simulados e Prática', cor: '#F85149', peso: '—',
      semanas: [
        { titulo: 'Simulados', tarefas: ['Revisar exames práticos (MeasureUp ou Microsoft)', 'Rever conceitos de DAX avançados', 'Refazer laboratórios com dúvidas'] },
      ],
    },
  ],
};

export const UNICAMP_PLAN = {
  nome: 'Unicamp 2027 - Ciência da Computação',
  cor: '#C9963F',
  dataAlvo: '2026-10-18',
  ritmoHorasDia: 2,
  fases: [
    {
      nome: 'Matemática', cor: '#C9963F', peso: 'Peso 3 · NMO 500',
      semanas: [
        { titulo: 'Conjuntos numéricos e funções', tarefas: ['Conjuntos, números reais, sequências e PA/PG', 'Funções afim, quadrática, modular', 'Equações e inequações'] },
        { titulo: 'Funções avançadas e polinômios', tarefas: ['Composição e inversa de funções, transformações gráficas', 'Operações com polinômios, raízes', 'Relações de Girard, Briot-Ruffini'] },
        { titulo: 'Geometria plana', tarefas: ['Congruência e semelhança de triângulos, Tales', 'Relações métricas nos triângulos', 'Quadriláteros, polígonos, círculos'] },
        { titulo: 'Geometria espacial e analítica', tarefas: ['Poliedros, prismas, pirâmides', 'Cilindros, cones e esferas — áreas e volumes', 'Coordenadas, distância, equação da reta e do círculo'] },
        { titulo: 'Contagem e probabilidade', tarefas: ['Princípios de contagem, arranjos e combinações', 'Probabilidade condicional', 'Binômio de Newton'] },
        { titulo: 'Sistemas, matrizes, trigonometria e logaritmos', tarefas: ['Sistemas lineares e matrizes', 'Trigonometria — lei dos senos/cossenos', 'Logaritmos e exponenciais — fecha o programa de MAT'] },
      ],
    },
    {
      nome: 'Física', cor: '#3F8CB0', peso: 'Peso 2',
      semanas: [
        { titulo: 'Fundamentos e cinemática', tarefas: ['Grandezas físicas, gráficos, ordem de grandeza', 'Cinemática em 1 e 2 dimensões', 'Treinar conversão de unidades'] },
        { titulo: 'Dinâmica e gravitação', tarefas: ['Leis de Newton, atrito, torque', 'Momento linear', 'Gravitação universal e Leis de Kepler'] },
        { titulo: 'Calorimetria e termodinâmica', tarefas: ['Temperatura, trocas de calor', 'Calor latente e calor específico', 'Gases e 1ª Lei da Termodinâmica'] },
        { titulo: 'Eletricidade e magnetismo', tarefas: ['Circuitos e Leis de Kirchhoff', 'Capacitores', 'Campo magnético e indução eletromagnética'] },
        { titulo: 'Óptica e ondas', tarefas: ['Ondas mecânicas', 'Refração e reflexão', 'Lentes, instrumentos ópticos, espectro eletromagnético'] },
      ],
    },
    {
      nome: 'Português e Literatura', cor: '#B8863B', peso: 'Peso 2',
      semanas: [
        { titulo: 'Leitura, morfologia e fonologia', tarefas: ['Interpretação de gêneros variados', 'Formação de palavras e radicais', 'Efeitos de sentido fonético-fonológicos'] },
        { titulo: 'Sintaxe e Redação', tarefas: ['Coordenação/subordinação, pontuação', 'Efeitos de sentido na construção de textos', 'Treinar as duas propostas de Redação'] },
        { titulo: 'Literatura — concentrar leitura e cenas', tarefas: ['Revisar as 9 obras da lista 2027', 'Anotar 2-3 cenas concretas por obra', 'Ver aba Leitura Obrigatória'] },
      ],
    },
    {
      nome: 'Química, Interdisciplinar e manutenção', cor: '#5B6B3F', peso: 'Peso 1',
      semanas: [
        { titulo: 'Estequiometria, equilíbrio e orgânica', tarefas: ['Balanceamento e cálculo estequiométrico', 'Equilíbrio químico e Le Chatelier', 'Funções orgânicas e nomenclatura'] },
        { titulo: 'Interdisciplinares + manutenção mínima', tarefas: ['Inglês + Física/Sociologia', 'Biologia + Química', 'Revisão rápida de Geo/História/Filosofia/Sociologia/Biologia'] },
      ],
    },
    {
      nome: 'Simulados e revisão final', cor: '#B85450', peso: '—',
      semanas: [
        { titulo: 'Simulado 1ª fase completo', tarefas: ['72 questões cronometradas', 'Corrigir e listar erros por TIPO', 'Revisar os 10 erros mais recorrentes'] },
        { titulo: 'Simulado 2ª fase + revisão final', tarefas: ['Redação + LPL + MAT + FIS + QUI + Interdisciplinar', 'Revisão dirigida nos pontos que falharam', 'Retomar anotações de cenas de literatura'] },
      ],
    },
  ],
};

// Trilha Dev: só a fase comum (6 primeiros meses) é importada como
// cronograma/fases/tarefas. As 4 trilhas de especialização (Analista,
// Cientista, Backend, Eng. Software) e a lista de recursos/links de cada
// mês ficam de fora por enquanto — são conteúdo de referência, não tarefas
// soltas, e fazem mais sentido como página de Notas no futuro.
export const TRILHA_DEV_PLAN = {
  nome: 'Trilha Dev — Fase Comum',
  cor: '#C9A876',
  diasPorMes: 30,
  ritmoHorasDia: 1,
  fases: [
    { nome: 'Mês 1 — Lógica de programação + Git/GitHub', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 1', tarefas: ['Lógica de Programação', 'Git e GitHub'] }] },
    { nome: 'Mês 2 — Python fundamentos (parte 1)', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 2', tarefas: ['Base em Python', 'Aprofundar / complementar (opcional)'] }] },
    { nome: 'Mês 3 — Python + POO básica + 1º projeto', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 3', tarefas: ['Completar a base (se ainda não viu)', 'Orientação a Objetos (POO) básica', 'Primeiro projeto'] }] },
    { nome: 'Mês 4 — SQL do zero ao intermediário', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 4', tarefas: ['Fundamentos de SQL', 'Curso prático completo', 'Praticar com exercícios interativos', 'Projeto do mês'] }] },
    { nome: 'Mês 5 — Teste: Power BI vs. Django/Flask', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 5', tarefas: ['Semanas 1–2 · Power BI (viés Dados)', 'Semanas 3–4 · Django/Flask (viés Backend)', 'Reflexão do mês'] }] },
    { nome: 'Mês 6 — Projeto de consolidação + escolha da trilha', cor: '#C9A876', peso: null,
      semanas: [{ titulo: 'Mês 6', tarefas: ['Projeto do mês', 'Deixar o portfólio apresentável', 'Decisão da trilha'] }] },
  ],
};
