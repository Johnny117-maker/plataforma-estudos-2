// Taxonomia fechada de matéria → assunto para provas da Fatec.
//
// Por que fechada: com texto livre, a IA devolve "Funções" numa chamada e
// "Função quadrática" noutra, e a recorrência entre provas — que é o produto
// inteiro — se dilui em vez de acumular. `cruzarFrequencias` agrupa por string,
// então dois nomes para a mesma coisa viram dois assuntos com metade do peso
// cada. Forçando a escolha em uma lista, o mesmo conteúdo sempre cai no mesmo
// balde.
//
// A lista foi montada a partir das 216 questões das provas de 2020, 2022,
// 2023-1 e 2023-2 — não é um currículo genérico, é o que essas bancas
// efetivamente cobraram. Acrescente itens conforme aparecerem, mas prefira
// encaixar no que existe: taxonomia que cresce a cada prova volta a ser texto
// livre com passos extras.

export const TAXONOMIA = {
  'Matemática': [
    'Razão e proporção',
    'Porcentagem e variação percentual',
    'Regra de três e grandezas proporcionais',
    'Função afim',
    'Função quadrática',
    'Função exponencial e logaritmo',
    'Progressões aritméticas e geométricas',
    'Sistemas de equações',
    'Matrizes e determinantes',
    'Análise combinatória',
    'Probabilidade',
    'Estatística: média, moda e mediana',
    'Estatística: dispersão e desvio padrão',
    'Geometria plana: áreas e perímetros',
    'Geometria plana: triângulos e semelhança',
    'Geometria plana: circunferência',
    'Geometria espacial: prismas e pirâmides',
    'Geometria analítica',
    'Trigonometria',
    'Escalas e conversão de unidades',
    'Conjuntos e diagramas',
  ],
  'Física': [
    'Cinemática e gráficos de movimento',
    'Dinâmica e leis de Newton',
    'Movimento circular e força centrípeta',
    'Trabalho, energia e potência',
    'Hidrostática e pressão',
    'Termologia e escalas de temperatura',
    'Calorimetria',
    'Termodinâmica',
    'Óptica e formação de sombras',
    'Ondulatória: frequência e comprimento de onda',
    'Eletrostática',
    'Eletrodinâmica: corrente, tensão e resistência',
    'Eletromagnetismo',
    'Física moderna e relatividade',
    'Gravitação e satélites',
    'Unidades e grandezas físicas',
  ],
  'Química': [
    'Estrutura atômica e tabela periódica',
    'Ligações químicas',
    'Forças intermoleculares',
    'Estequiometria e mol',
    'Balanceamento de equações',
    'Soluções e concentração',
    'Termoquímica e entalpia',
    'Cinética química',
    'Equilíbrio químico',
    'Ácidos, bases e pH',
    'Eletroquímica',
    'Química orgânica: funções',
    'Química orgânica: reações',
    'Polímeros',
    'Química ambiental',
    'Radioatividade',
  ],
  'Biologia': [
    'Citologia e organelas',
    'Bioquímica celular e metabolismo',
    'Genética: leis de Mendel',
    'Genética: grupos sanguíneos',
    'Biologia molecular: DNA e RNA',
    'Biotecnologia e DNA recombinante',
    'Microbiologia: bactérias e vírus',
    'Fungos e leveduras',
    'Botânica: tecidos e crescimento',
    'Botânica: ciclos reprodutivos',
    'Fisiologia humana',
    'Nutrição e alimentos',
    'Parasitologia e verminoses',
    'Saúde pública, vacinas e imunização',
    'Ecologia: relações ecológicas',
    'Ecologia: cadeias e ciclos',
    'Biomas e ecossistemas',
    'Evolução',
  ],
  'História Geral': [
    'Pré-história e revolução neolítica',
    'Antiguidade clássica',
    'Idade Média e feudalismo',
    'Renascimento e expansão marítima',
    'Revolução Industrial',
    'Revolução Francesa e iluminismo',
    'Imperialismo e partilha da África',
    'Primeira e Segunda Guerra Mundial',
    'Guerra Fria',
    'História da ciência e da tecnologia',
  ],
  'História Brasileira': [
    'Brasil colonial: capitanias e engenhos',
    'Escravidão e resistência',
    'Ciclo do ouro e mineração',
    'Brasil império',
    'República Velha e Revolta da Vacina',
    'Era Vargas e legislação trabalhista',
    'Ditadura militar',
    'Brasil contemporâneo',
  ],
  'Geografia': [
    'Cartografia e escalas',
    'Geomorfologia e relevo',
    'Climatologia',
    'Hidrografia e recursos hídricos',
    'Biomas brasileiros',
    'Demografia e população',
    'Urbanização',
    'Agropecuária e agronegócio',
    'Indústria e energia',
    'Globalização e meio técnico-científico',
    'Geopolítica',
    'Questões ambientais e sustentabilidade',
  ],
  'Português': [
    'Interpretação de texto',
    'Linguagem verbal e não verbal',
    'Figuras de linguagem',
    'Funções da linguagem',
    'Variação linguística e gêneros textuais',
    'Morfologia e classes de palavras',
    'Formação de palavras',
    'Sintaxe: períodos e orações',
    'Coesão e coerência',
    'Semântica e paráfrase',
    'Norma padrão e reescrita',
  ],
  'Literatura': [
    'Análise de poema',
    'Escolas literárias',
    'Prosa brasileira',
  ],
  'Inglês': [
    'Compreensão de texto',
    'Vocabulário e sinônimos',
    'Conectivos e estrutura frasal',
  ],
  'Raciocínio Lógico': [
    'Lógica proposicional e negação',
    'Diagramas lógicos e conjuntos',
    'Sequências e padrões',
    'Problemas de contagem e dedução',
    'Calendários e ciclos',
  ],
  'Sociologia': [
    'Trabalho e relações de produção',
    'Desigualdade e estratificação social',
    'Cidadania e políticas públicas',
  ],
  'Filosofia': [
    'Filosofia antiga',
    'Ética e política',
  ],
};

/** Lista achatada "Matéria — Assunto", que é o formato do prompt. */
export function paresCanonicos() {
  const pares = [];
  for (const [materia, assuntos] of Object.entries(TAXONOMIA)) {
    for (const assunto of assuntos) pares.push({ materia, assunto });
  }
  return pares;
}


// ------------------------------------------------------------------ apelidos
//
// Semelhança de string não sabe que "Lei de Hess" é termoquímica nem que
// "Sistema ABO" é grupos sanguíneos — isso é conhecimento de domínio. Medido:
// só com similaridade, 1 de 6 grupos de variantes convergia para o mesmo par.
// Com os apelidos abaixo, 6 de 6. Cada entrada é um gatilho que aponta direto
// para o par canônico, sem passar pela comparação difusa.
export const APELIDOS = {
  // Matemática
  'funcao do 2 grau': ['Matemática', 'Função quadrática'],
  'funcao do segundo grau': ['Matemática', 'Função quadrática'],
  'equacao do segundo grau': ['Matemática', 'Função quadrática'],
  'parabola': ['Matemática', 'Função quadrática'],
  'funcoes': ['Matemática', 'Função afim'],
  'funcao do 1 grau': ['Matemática', 'Função afim'],
  'funcao do primeiro grau': ['Matemática', 'Função afim'],
  'area de figuras planas': ['Matemática', 'Geometria plana: áreas e perímetros'],
  'calculo de areas': ['Matemática', 'Geometria plana: áreas e perímetros'],
  'geometria plana': ['Matemática', 'Geometria plana: áreas e perímetros'],
  'perimetro': ['Matemática', 'Geometria plana: áreas e perímetros'],
  'teorema de pitagoras': ['Matemática', 'Geometria plana: triângulos e semelhança'],
  'semelhanca de triangulos': ['Matemática', 'Geometria plana: triângulos e semelhança'],
  'circunferencia': ['Matemática', 'Geometria plana: circunferência'],
  'volume': ['Matemática', 'Geometria espacial: prismas e pirâmides'],
  'tronco de piramide': ['Matemática', 'Geometria espacial: prismas e pirâmides'],
  'poliedros': ['Matemática', 'Geometria espacial: prismas e pirâmides'],
  'regra de tres': ['Matemática', 'Regra de três e grandezas proporcionais'],
  'proporcionalidade': ['Matemática', 'Razão e proporção'],
  'razao e proporcao': ['Matemática', 'Razão e proporção'],
  'porcentagem': ['Matemática', 'Porcentagem e variação percentual'],
  'juros': ['Matemática', 'Porcentagem e variação percentual'],
  'pg': ['Matemática', 'Progressões aritméticas e geométricas'],
  'pa': ['Matemática', 'Progressões aritméticas e geométricas'],
  'soma dos infinitos termos': ['Matemática', 'Progressões aritméticas e geométricas'],
  'matriz': ['Matemática', 'Matrizes e determinantes'],
  'combinatoria': ['Matemática', 'Análise combinatória'],
  'permutacao': ['Matemática', 'Análise combinatória'],
  'media aritmetica': ['Matemática', 'Estatística: média, moda e mediana'],
  'moda': ['Matemática', 'Estatística: média, moda e mediana'],
  'mediana': ['Matemática', 'Estatística: média, moda e mediana'],
  'desvio padrao': ['Matemática', 'Estatística: dispersão e desvio padrão'],
  'amplitude': ['Matemática', 'Estatística: dispersão e desvio padrão'],
  'escala': ['Matemática', 'Escalas e conversão de unidades'],
  'diagramas de venn': ['Matemática', 'Conjuntos e diagramas'],
  'conjuntos': ['Matemática', 'Conjuntos e diagramas'],

  // Física
  'cinematica': ['Física', 'Cinemática e gráficos de movimento'],
  'mru': ['Física', 'Cinemática e gráficos de movimento'],
  'velocidade media': ['Física', 'Cinemática e gráficos de movimento'],
  'grafico velocidade tempo': ['Física', 'Cinemática e gráficos de movimento'],
  'leis de newton': ['Física', 'Dinâmica e leis de Newton'],
  'forca centripeta': ['Física', 'Movimento circular e força centrípeta'],
  'movimento circular': ['Física', 'Movimento circular e força centrípeta'],
  'pressao': ['Física', 'Hidrostática e pressão'],
  'calorimetria': ['Física', 'Calorimetria'],
  'calor especifico': ['Física', 'Calorimetria'],
  'temperatura': ['Física', 'Termologia e escalas de temperatura'],
  'escalas termometricas': ['Física', 'Termologia e escalas de temperatura'],
  'eclipse': ['Física', 'Óptica e formação de sombras'],
  'sombra e penumbra': ['Física', 'Óptica e formação de sombras'],
  'ondas': ['Física', 'Ondulatória: frequência e comprimento de onda'],
  'comprimento de onda': ['Física', 'Ondulatória: frequência e comprimento de onda'],
  'ondas eletromagneticas': ['Física', 'Ondulatória: frequência e comprimento de onda'],
  'lei de ohm': ['Física', 'Eletrodinâmica: corrente, tensão e resistência'],
  'resistencia eletrica': ['Física', 'Eletrodinâmica: corrente, tensão e resistência'],
  'corrente eletrica': ['Física', 'Eletrodinâmica: corrente, tensão e resistência'],
  'circuitos': ['Física', 'Eletrodinâmica: corrente, tensão e resistência'],
  'campo magnetico': ['Física', 'Eletromagnetismo'],
  'bobina': ['Física', 'Eletromagnetismo'],
  'relatividade': ['Física', 'Física moderna e relatividade'],
  'dilatacao do tempo': ['Física', 'Física moderna e relatividade'],
  'satelites': ['Física', 'Gravitação e satélites'],
  'orbita': ['Física', 'Gravitação e satélites'],

  // Química
  'tabela periodica': ['Química', 'Estrutura atômica e tabela periódica'],
  'numero atomico': ['Química', 'Estrutura atômica e tabela periódica'],
  'isotopos': ['Química', 'Estrutura atômica e tabela periódica'],
  'raio atomico': ['Química', 'Estrutura atômica e tabela periódica'],
  'ligacao ionica': ['Química', 'Ligações químicas'],
  'ligacao covalente': ['Química', 'Ligações químicas'],
  'geometria molecular': ['Química', 'Ligações químicas'],
  'ponte de hidrogenio': ['Química', 'Forças intermoleculares'],
  'ligacao de hidrogenio': ['Química', 'Forças intermoleculares'],
  'dipolo': ['Química', 'Forças intermoleculares'],
  'ion dipolo': ['Química', 'Forças intermoleculares'],
  'estequiometria': ['Química', 'Estequiometria e mol'],
  'calculo estequiometrico': ['Química', 'Estequiometria e mol'],
  'mol': ['Química', 'Estequiometria e mol'],
  'avogadro': ['Química', 'Estequiometria e mol'],
  'massa molar': ['Química', 'Estequiometria e mol'],
  'balanceamento': ['Química', 'Balanceamento de equações'],
  'concentracao': ['Química', 'Soluções e concentração'],
  'solucoes': ['Química', 'Soluções e concentração'],
  'termoquimica': ['Química', 'Termoquímica e entalpia'],
  'entalpia': ['Química', 'Termoquímica e entalpia'],
  'lei de hess': ['Química', 'Termoquímica e entalpia'],
  'calor de reacao': ['Química', 'Termoquímica e entalpia'],
  'velocidade de reacao': ['Química', 'Cinética química'],
  'fatores cineticos': ['Química', 'Cinética química'],
  'catalisador': ['Química', 'Cinética química'],
  'constante de equilibrio': ['Química', 'Equilíbrio químico'],
  'ph': ['Química', 'Ácidos, bases e pH'],
  'acidos e bases': ['Química', 'Ácidos, bases e pH'],
  'oxirreducao': ['Química', 'Eletroquímica'],
  'funcoes organicas': ['Química', 'Química orgânica: funções'],
  'alcool': ['Química', 'Química orgânica: funções'],
  'acido carboxilico': ['Química', 'Química orgânica: funções'],
  'hidrocarbonetos': ['Química', 'Química orgânica: funções'],
  'hidrolise': ['Química', 'Química orgânica: reações'],
  'esterificacao': ['Química', 'Química orgânica: reações'],
  'pirolise': ['Química', 'Química orgânica: reações'],
  'polimerizacao': ['Química', 'Polímeros'],
  'pvc': ['Química', 'Polímeros'],
  'radioatividade': ['Química', 'Radioatividade'],

  // Biologia
  'organelas': ['Biologia', 'Citologia e organelas'],
  'membrana plasmatica': ['Biologia', 'Citologia e organelas'],
  'osmose': ['Biologia', 'Citologia e organelas'],
  'fotossintese': ['Biologia', 'Bioquímica celular e metabolismo'],
  'respiracao celular': ['Biologia', 'Bioquímica celular e metabolismo'],
  'enzimas': ['Biologia', 'Bioquímica celular e metabolismo'],
  'genetica': ['Biologia', 'Genética: leis de Mendel'],
  'heranca': ['Biologia', 'Genética: leis de Mendel'],
  'sistema abo': ['Biologia', 'Genética: grupos sanguíneos'],
  'tipos sanguineos': ['Biologia', 'Genética: grupos sanguíneos'],
  'grupos sanguineos': ['Biologia', 'Genética: grupos sanguíneos'],
  'alelos multiplos': ['Biologia', 'Genética: grupos sanguíneos'],
  'dna': ['Biologia', 'Biologia molecular: DNA e RNA'],
  'rna': ['Biologia', 'Biologia molecular: DNA e RNA'],
  'dna recombinante': ['Biologia', 'Biotecnologia e DNA recombinante'],
  'engenharia genetica': ['Biologia', 'Biotecnologia e DNA recombinante'],
  'eletroforese': ['Biologia', 'Biotecnologia e DNA recombinante'],
  'bacterias': ['Biologia', 'Microbiologia: bactérias e vírus'],
  'virus': ['Biologia', 'Microbiologia: bactérias e vírus'],
  'leveduras': ['Biologia', 'Fungos e leveduras'],
  'fermentacao': ['Biologia', 'Fungos e leveduras'],
  'micorrizas': ['Biologia', 'Ecologia: relações ecológicas'],
  'mutualismo': ['Biologia', 'Ecologia: relações ecológicas'],
  'parasitismo': ['Biologia', 'Ecologia: relações ecológicas'],
  'xilema': ['Biologia', 'Botânica: tecidos e crescimento'],
  'aneis de crescimento': ['Biologia', 'Botânica: tecidos e crescimento'],
  'cambio': ['Biologia', 'Botânica: tecidos e crescimento'],
  'pteridofitas': ['Biologia', 'Botânica: ciclos reprodutivos'],
  'gametofito': ['Biologia', 'Botânica: ciclos reprodutivos'],
  'verminoses': ['Biologia', 'Parasitologia e verminoses'],
  'ascaridiase': ['Biologia', 'Parasitologia e verminoses'],
  'vacinas': ['Biologia', 'Saúde pública, vacinas e imunização'],
  'imunizacao': ['Biologia', 'Saúde pública, vacinas e imunização'],
  'poliomielite': ['Biologia', 'Saúde pública, vacinas e imunização'],
  'nutrientes': ['Biologia', 'Nutrição e alimentos'],
  'vitaminas': ['Biologia', 'Nutrição e alimentos'],

  // História
  'revolucao neolitica': ['História Geral', 'Pré-história e revolução neolítica'],
  'pre historia': ['História Geral', 'Pré-história e revolução neolítica'],
  'feudalismo': ['História Geral', 'Idade Média e feudalismo'],
  'peste negra': ['História Geral', 'Idade Média e feudalismo'],
  'revolucao industrial': ['História Geral', 'Revolução Industrial'],
  'imprensa': ['História Geral', 'História da ciência e da tecnologia'],
  'gutenberg': ['História Geral', 'História da ciência e da tecnologia'],
  'conferencia de berlim': ['História Geral', 'Imperialismo e partilha da África'],
  'neocolonialismo': ['História Geral', 'Imperialismo e partilha da África'],
  'guerra fria': ['História Geral', 'Guerra Fria'],
  'capitanias hereditarias': ['História Brasileira', 'Brasil colonial: capitanias e engenhos'],
  'engenhos': ['História Brasileira', 'Brasil colonial: capitanias e engenhos'],
  'escravidao': ['História Brasileira', 'Escravidão e resistência'],
  'ciclo do ouro': ['História Brasileira', 'Ciclo do ouro e mineração'],
  'bateia': ['História Brasileira', 'Ciclo do ouro e mineração'],
  'revolta da vacina': ['História Brasileira', 'República Velha e Revolta da Vacina'],
  'oswaldo cruz': ['História Brasileira', 'República Velha e Revolta da Vacina'],
  'era vargas': ['História Brasileira', 'Era Vargas e legislação trabalhista'],
  'getulio vargas': ['História Brasileira', 'Era Vargas e legislação trabalhista'],
  'clt': ['História Brasileira', 'Era Vargas e legislação trabalhista'],

  // Geografia
  'cartografia': ['Geografia', 'Cartografia e escalas'],
  'escala de mapa': ['Geografia', 'Cartografia e escalas'],
  'latitude': ['Geografia', 'Cartografia e escalas'],
  'relevo': ['Geografia', 'Geomorfologia e relevo'],
  'geomorfologia': ['Geografia', 'Geomorfologia e relevo'],
  'clima': ['Geografia', 'Climatologia'],
  'amplitude termica': ['Geografia', 'Climatologia'],
  'pantanal': ['Geografia', 'Biomas brasileiros'],
  'amazonia': ['Geografia', 'Biomas brasileiros'],
  'demografia': ['Geografia', 'Demografia e população'],
  'taxa de fecundidade': ['Geografia', 'Demografia e população'],
  'agronegocio': ['Geografia', 'Agropecuária e agronegócio'],
  'pecuaria': ['Geografia', 'Agropecuária e agronegócio'],
  'agricultura': ['Geografia', 'Agropecuária e agronegócio'],
  'globalizacao': ['Geografia', 'Globalização e meio técnico-científico'],
  'meio tecnico cientifico informacional': ['Geografia', 'Globalização e meio técnico-científico'],
  'milton santos': ['Geografia', 'Globalização e meio técnico-científico'],
  'geopolitica': ['Geografia', 'Geopolítica'],
  'sustentabilidade': ['Geografia', 'Questões ambientais e sustentabilidade'],
  'agenda 2030': ['Geografia', 'Questões ambientais e sustentabilidade'],
  'ods': ['Geografia', 'Questões ambientais e sustentabilidade'],

  // Português
  'interpretacao textual': ['Português', 'Interpretação de texto'],
  'compreensao de texto': ['Português', 'Interpretação de texto'],
  'charge': ['Português', 'Linguagem verbal e não verbal'],
  'tirinha': ['Português', 'Linguagem verbal e não verbal'],
  'quadrinhos': ['Português', 'Linguagem verbal e não verbal'],
  'cartum': ['Português', 'Linguagem verbal e não verbal'],
  'metafora': ['Português', 'Figuras de linguagem'],
  'metonimia': ['Português', 'Figuras de linguagem'],
  'personificacao': ['Português', 'Figuras de linguagem'],
  'paronomasia': ['Português', 'Figuras de linguagem'],
  'sinestesia': ['Português', 'Figuras de linguagem'],
  'recursos estilisticos': ['Português', 'Figuras de linguagem'],
  'figuras de estilo': ['Português', 'Figuras de linguagem'],
  'classes de palavras': ['Português', 'Morfologia e classes de palavras'],
  'pronomes': ['Português', 'Morfologia e classes de palavras'],
  'derivacao': ['Português', 'Formação de palavras'],
  'composicao': ['Português', 'Formação de palavras'],
  'conjuncoes': ['Português', 'Coesão e coerência'],
  'conectivos': ['Português', 'Coesão e coerência'],
  'oracoes subordinadas': ['Português', 'Sintaxe: períodos e orações'],
  'parafrase': ['Português', 'Semântica e paráfrase'],
  'reescrita': ['Português', 'Norma padrão e reescrita'],

  // Inglês / Lógica
  'vocabulario': ['Inglês', 'Vocabulário e sinônimos'],
  'sinonimos': ['Inglês', 'Vocabulário e sinônimos'],
  'reading comprehension': ['Inglês', 'Compreensão de texto'],
  'negacao logica': ['Raciocínio Lógico', 'Lógica proposicional e negação'],
  'proposicoes': ['Raciocínio Lógico', 'Lógica proposicional e negação'],
  'diagramas de euler': ['Raciocínio Lógico', 'Diagramas lógicos e conjuntos'],
  'silogismo': ['Raciocínio Lógico', 'Diagramas lógicos e conjuntos'],
  'sequencias': ['Raciocínio Lógico', 'Sequências e padrões'],
  'dias da semana': ['Raciocínio Lógico', 'Calendários e ciclos'],
};

function chaveApelido(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(\d)[oa]\b/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

/** Procura um apelido dentro do texto. Casa a chave mais longa primeiro. */
function porApelido(materia, assunto) {
  const alvo = chaveApelido(`${assunto} ${materia}`);
  const chaves = Object.keys(APELIDOS).sort((a, b) => b.length - a.length);
  for (const chave of chaves) {
    if (alvo === chave || alvo.includes(` ${chave} `) || alvo.startsWith(`${chave} `) || alvo.endsWith(` ${chave}`)) {
      const [m, a] = APELIDOS[chave];
      return { materia: m, assunto: a, similaridade: 1, canonico: true, via: 'apelido' };
    }
  }
  return null;
}

// ------------------------------------------------------------ normalização

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na']);

function tokens(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !PARADAS.has(t));
}

function similaridade(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let comuns = 0;
  for (const t of ta) {
    if (tb.has(t)) { comuns += 1; continue; }
    // radical: "funcoes" casa com "funcao", "geometrico" com "geometria"
    for (const u of tb) {
      if (t.length > 4 && u.length > 4 && (t.startsWith(u.slice(0, 5)) || u.startsWith(t.slice(0, 5)))) {
        comuns += 0.7;
        break;
      }
    }
  }
  return comuns / Math.max(ta.size, tb.size);
}

/**
 * Encaixa um par livre devolvido pela IA no par canônico mais próximo.
 *
 * É a rede de segurança: mesmo com o prompt fechado, modelo pequeno às vezes
 * parafraseia. Sem isso, "Estequiometria" e "Estequiometria e mol" virariam
 * dois assuntos distintos e a recorrência quebraria de novo.
 *
 * Devolve { materia, assunto, similaridade, canonico }.
 */
export function normalizarPar(materiaBruta, assuntoBruto, limite = 0.34) {
  if (ehCanonico(materiaBruta, assuntoBruto)) {
    return { materia: materiaBruta, assunto: assuntoBruto, similaridade: 1, canonico: true, via: 'exato' };
  }
  const viaApelido = porApelido(materiaBruta, assuntoBruto);
  if (viaApelido) return viaApelido;

  const alvo = `${materiaBruta || ''} ${assuntoBruto || ''}`;
  let melhor = null;
  let melhorNota = 0;

  for (const par of paresCanonicos()) {
    // A matéria pesa mais: assunto parecido em matéria errada é erro grave.
    const notaMateria = similaridade(materiaBruta, par.materia);
    const notaAssunto = similaridade(assuntoBruto, par.assunto);
    const nota = notaMateria * 0.4 + notaAssunto * 0.6
      + (similaridade(alvo, `${par.materia} ${par.assunto}`) * 0.2);
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = par;
    }
  }

  if (!melhor || melhorNota < limite) {
    return {
      materia: materiaBruta || 'Não classificada',
      assunto: assuntoBruto || 'Não classificado',
      similaridade: melhorNota,
      canonico: false,
      via: 'nenhum',
    };
  }
  return { materia: melhor.materia, assunto: melhor.assunto, similaridade: melhorNota, canonico: true, via: 'similaridade' };
}

/** Verdadeiro se o par já é exatamente canônico. */
export function ehCanonico(materia, assunto) {
  return Boolean(TAXONOMIA[materia]?.includes(assunto));
}

/**
 * Bloco compacto para o prompt. Enviar a taxonomia inteira custa ~1.200 tokens
 * em toda chamada; quando a matéria já é conhecida (cabeçalho de área, cache),
 * dá para mandar só o ramo dela.
 */
export function taxonomiaParaPrompt(materiasFiltro = null) {
  const entradas = Object.entries(TAXONOMIA).filter(
    ([m]) => !materiasFiltro || materiasFiltro.includes(m)
  );
  return entradas.map(([m, as]) => `${m}: ${as.join(' | ')}`).join('\n');
}