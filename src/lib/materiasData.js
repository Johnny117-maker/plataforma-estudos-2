// Matérias padrão, cada uma com uma cor fixa e distinta — essa cor é usada
// em todo lugar que a matéria aparece (Kanban de Assuntos, e também nas
// tarefas quando você liga uma tarefa a uma matéria).
export const DEFAULT_MATERIAS = [
  { nome: 'Matemática Básica', cor: '#F2C811', ordem: 0 },
  { nome: 'Matemática', cor: '#FF8A3D', ordem: 1 },
  { nome: 'Português', cor: '#4FB6AE', ordem: 2 },
  { nome: 'Física', cor: '#2F81F7', ordem: 3 },
  { nome: 'Química', cor: '#5B6B3F', ordem: 4 },
  { nome: 'Biologia', cor: '#238636', ordem: 5 },
  { nome: 'História Geral', cor: '#A371F7', ordem: 6 },
  { nome: 'História Brasileira', cor: '#D96C82', ordem: 7 },
  { nome: 'Geografia', cor: '#8B5E3C', ordem: 8 },
];

// Assuntos (subgêneros) de Matemática, organizados em 3 blocos temáticos
// (Álgebra/Funções, Geometria, Combinatória/Estatística/Probabilidade) —
// a importação junta tudo numa lista só, a organização em blocos aqui é
// só pra facilitar a leitura deste arquivo.
export const MATEMATICA_SUBGENEROS = [
  // Álgebra e Funções
  'Teoria dos conjuntos',
  'Conjuntos numéricos e Intervalos reais',
  'Progressão aritmética (PA)',
  'Progressão geométrica (PG)',
  'Teoria geral de funções',
  'Função composta e Função inversa',
  'Função constante e Função afim',
  'Função do segundo grau (quadrática)',
  'Função exponencial',
  'Propriedades dos logaritmos',
  'Função logarítmica',
  'Função modular',
  'Funções trigonométricas',
  'Matriz e Determinante',
  // Geometria
  'Ângulos',
  'Triângulo equilátero',
  'Semelhança de triângulos',
  'Teorema de Tales',
  'Triângulo retângulo: relações métricas',
  'Triângulo retângulo: relações trigonométricas',
  'Lei dos senos e dos cossenos',
  'Polígonos',
  'Quadriláteros e Hexágonos',
  'Circunferência e Círculo',
  'Geometria de posição: Posições relativas e Projeção ortogonal',
  'Poliedros',
  'Prismas',
  'Cilindros',
  'Pirâmides e Troncos de pirâmides',
  'Cones e Troncos de cones',
  'Esferas',
  'Sólidos inscritos',
  'Estudo do ponto',
  'Estudo da reta',
  'Estudo da circunferência',
  // Combinatória, Estatística e Probabilidade
  'Princípio Fundamental da Contagem (PFC)',
  'Fatorial',
  'Arranjo',
  'Permutação simples e Permutação circular',
  'Combinação',
  'Estatística: Visão geral, Organização e Representação de dados',
  'Estatística: Médias, Medidas de tendência central e de dispersão',
  'Interpretação de gráficos',
  'Probabilidade: Visão geral',
  'Probabilidade da união de eventos',
  'Probabilidade de eventos simultâneos',
  'Probabilidade condicional',
];

// Mapa: nome da matéria -> lista de assuntos prontos pra importar.
// Por enquanto só Matemática está preenchida; as outras matérias entram
// aqui conforme você for me passando as listas.
export const SUBGENEROS_PADRAO_POR_MATERIA = {
  'Matemática': MATEMATICA_SUBGENEROS,
};
