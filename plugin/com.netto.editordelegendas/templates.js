// =============================================================================
// DaVinci Textos Virais - templates prontos
// =============================================================================
//
// Um template é um conjunto de valores do formulário (estilo, fonte, cores, posição...).
// Ao clicar num template, a interface preenche esses campos; o texto e o timecode não mudam.
//
// Para criar um template novo, copie um bloco abaixo e mude os valores. Campos aceitos:
//   id, nome            identificação (id único, sem espaços)
//   fonte               lista de fontes em ordem de preferência: usa a primeira instalada
//   estiloFonte         peso/estilo da fonte (Bold, Black, Regular...)
//   estilo              id da entrada em estilos.js (pop, fade, subindo, digitacao, destaque)
//   saida, duracaoSaida 'auto' (padrão da entrada) ou id de SAIDAS em estilos.js; duração em segundos
//   cor, corDestaque, corFundo   cores em hexadecimal
//   tamanho, x, y       tamanho (0,02 a 0,3) e posição (0 a 1)
//   contorno, sombra, brilho, fundo, maiusculas   liga/desliga (true/false)
//   opacidadeFundo      opacidade da caixa de fundo (0 a 1)
//   corContorno, espessuraContorno
//   corSombra, opacidadeSombra, suavidadeSombra, sombraX, sombraY (distância em tamanhos de texto)
//   corBrilho ('' = cor do texto), intensidadeBrilho, tamanhoBrilho
//   margemFundoX, margemFundoY, arredondarFundo
//   duracao             duração padrão em segundos (opcional)
//   modo, maxPalavras   como a transcrição agrupa as palavras (opcional)
//   somEntrada, somPalavra  'auto' (padrão do estilo), 'nenhum' ou id de sons/sons.json
//   volumeSom           volume dos efeitos em dB (ex.: -8)
//
// Os templates que o usuário salva pela interface ficam em
// ~/Library/Application Support/EditorDeLegendas/templates.json (não neste arquivo).
// =============================================================================

const PADRAO = {
    estilo: 'pop', fonte: ['Montserrat', 'Arial'], estiloFonte: 'Bold',
    cor: '#ffffff', corDestaque: '#ffd400', corFundo: '#000000',
    tamanho: 0.08, x: 0.5, y: 0.3,
    contorno: false, sombra: false, brilho: false, fundo: false, maiusculas: false,
    opacidadeFundo: 0.85,
    // detalhes dos efeitos (iguais aos padrões do formulário)
    corContorno: '#000000', espessuraContorno: 0.06,
    corSombra: '#000000', opacidadeSombra: 0.8, suavidadeSombra: 6, sombraX: 0.03, sombraY: 0.05,
    corBrilho: '', intensidadeBrilho: 1, tamanhoBrilho: 14,
    margemFundoX: 0.25, margemFundoY: 0.1, arredondarFundo: 0.3,
    saida: 'auto', duracaoSaida: 0.35,
    sons: true, somEntrada: 'auto', somPalavra: 'auto', somSaida: 'auto', volumeSom: -8,
};

const TEMPLATES = [
    {
        id: 'reels-classico', nome: 'Reels Clássico', saida: 'encolher',
        fonte: ['Montserrat', 'Arial Black'], estiloFonte: 'Black',
        estilo: 'pop', contorno: true, sombra: true, maiusculas: true, tamanho: 0.085,
    },
    {
        id: 'karaoke-amarelo', nome: 'Karaokê Amarelo',
        fonte: ['Montserrat', 'Arial Black'], estiloFonte: 'ExtraBold',
        estilo: 'destaque', corDestaque: '#ffd400', contorno: true, sombra: true, maiusculas: true,
        tamanho: 0.08, modo: 'frase', maxPalavras: 4,
    },
    {
        id: 'karaoke-verde', nome: 'Karaokê Verde', somPalavra: 'tique', volumeSom: -12,
        fonte: ['Poppins', 'Arial'], estiloFonte: 'Black',
        estilo: 'destaque', corDestaque: '#39ff6a', contorno: true, maiusculas: true,
        tamanho: 0.08, modo: 'frase', maxPalavras: 3,
    },
    {
        id: 'uma-palavra', nome: 'Uma Palavra por Vez', somEntrada: 'bloop',
        fonte: ['Arial Black', 'Impact'], estiloFonte: 'Regular',
        estilo: 'pop', contorno: true, sombra: true, maiusculas: true,
        tamanho: 0.13, y: 0.45, modo: 'palavra', maxPalavras: 1,
    },
    {
        id: 'impacto', nome: 'Impacto', saida: 'encolher', somEntrada: 'impacto', volumeSom: -6, espessuraContorno: 0.1, suavidadeSombra: 0, sombraX: 0.05, sombraY: 0.07, opacidadeSombra: 1,
        fonte: ['Impact', 'Arial Black'], estiloFonte: 'Regular',
        estilo: 'pop', cor: '#ffe600', contorno: true, sombra: true, maiusculas: true, tamanho: 0.11,
    },
    {
        id: 'tarja-preta', nome: 'Tarja Preta', saida: 'descer',
        fonte: ['Inter', 'Helvetica Neue', 'Arial'], estiloFonte: 'Bold',
        estilo: 'subindo', fundo: true, corFundo: '#000000', opacidadeFundo: 0.8, tamanho: 0.06, y: 0.22,
    },
    {
        id: 'etiqueta-amarela', nome: 'Etiqueta Amarela', saida: 'encolher', somEntrada: 'bloop', arredondarFundo: 1, margemFundoX: 0.35,
        fonte: ['Poppins', 'Arial'], estiloFonte: 'Bold',
        estilo: 'pop', cor: '#111111', fundo: true, corFundo: '#ffd400', opacidadeFundo: 1, tamanho: 0.065,
    },
    {
        id: 'etiqueta-branca', nome: 'Etiqueta Branca',
        fonte: ['Inter', 'Helvetica Neue', 'Arial'], estiloFonte: 'Semi Bold',
        estilo: 'fade', cor: '#111111', fundo: true, corFundo: '#ffffff', opacidadeFundo: 1, tamanho: 0.06,
    },
    {
        id: 'neon', nome: 'Neon', somEntrada: 'brilho',
        fonte: ['Futura', 'Avenir Next', 'Arial'], estiloFonte: 'Bold',
        estilo: 'fade', cor: '#00f0ff', brilho: true, maiusculas: true, tamanho: 0.08,
    },
    {
        id: 'neon-rosa', nome: 'Neon Rosa', somEntrada: 'glitch', tamanhoBrilho: 22,
        fonte: ['Futura', 'Avenir Next', 'Arial'], estiloFonte: 'Bold',
        estilo: 'pop', cor: '#ff3dcb', brilho: true, maiusculas: true, tamanho: 0.08,
    },
    {
        id: 'minimalista', nome: 'Minimalista', somEntrada: 'nenhum',
        fonte: ['Avenir Next', 'Helvetica Neue', 'Arial'], estiloFonte: 'Medium',
        estilo: 'fade', sombra: true, tamanho: 0.055, y: 0.15,
    },
    {
        id: 'maquina-escrever', nome: 'Máquina de Escrever', saida: 'apagar',
        fonte: ['American Typewriter', 'Courier New'], estiloFonte: 'Semibold',
        estilo: 'digitacao', sombra: true, tamanho: 0.065,
    },
    {
        id: 'subindo-suave', nome: 'Subindo Suave', saida: 'subir',
        fonte: ['Poppins', 'Arial'], estiloFonte: 'SemiBold',
        estilo: 'subindo', sombra: true, tamanho: 0.07,
    },
    {
        id: 'titulo-central', nome: 'Título Central', saida: 'subir', somEntrada: 'whoosh',
        fonte: ['Montserrat', 'Arial Black'], estiloFonte: 'Black',
        estilo: 'pop', contorno: true, sombra: true, maiusculas: true, tamanho: 0.14, y: 0.5, duracao: 2,
    },
];

// =============================================================================
// Composições ("letterings"): várias camadas de texto num só título
// =============================================================================
// Inspiradas no estilo de títulos virais (fontes misturadas, palavra gigante, script colorido,
// riscados, etiquetas, neon). Cada camada é descrita em estilos.js (montarSpecComposicao):
// escala e dx/dy são medidos em "tamanhos" (o Tamanho do formulário); dy positivo = para baixo.
// No formulário, cada LINHA do texto vira o texto de uma camada (na ordem abaixo, sem as barras).

const SANS_PESADA = ['Montserrat', 'Poppins', 'Inter', 'Arial Black'];
const SANS = ['Montserrat', 'Poppins', 'Inter', 'Helvetica Neue', 'Arial'];
const SANS_ITALICA = ['Avenir Next', 'Montserrat', 'Poppins', 'Arial'];
const SERIFA_ITALICA = ['Hoefler Text', 'Charter', 'Baskerville', 'Georgia', 'Times New Roman'];
const SERIFA_PESADA = ['Superclarendon', 'Charter', 'Rockwell', 'Georgia'];
const INTER = ['Inter', 'Helvetica Neue', 'Arial'];

const COMPOSICOES = [
    {
        id: 'c-legenda-limpa', nome: 'Legenda Limpa', tamanho: 0.075, saida: 'fade',
        camadas: [
            { texto: 'Seu', fonte: SANS, estiloFonte: 'Medium', escala: 0.5, dx: -1.3, dy: -0.66, ancora: 'direita', cor: '#ffffff', entrada: 'fade' },
            { texto: 'texto', fonte: SANS_PESADA, estiloFonte: 'Bold', escala: 0.95, dx: -1.2, dy: -0.62, ancora: 'esquerda', cor: '#ffffff', entrada: 'pop', atraso: 0.05 },
            { texto: 'legendas', fonte: SANS_PESADA, estiloFonte: 'Black', escala: 1.2, dx: 0, dy: 0.2, cor: '#ffffff', entrada: 'pop', atraso: 0.12, principal: true },
            { texto: 'criativas', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 0.9, dx: 2.4, dy: 0.95, ancora: 'direita', cor: '#9b7bff', entrada: 'deslizar', atraso: 0.25 },
        ],
    },
    {
        id: 'c-luxo', nome: 'Luxo Roxo', tamanho: 0.075, saida: 'fade',
        camadas: [
            { texto: 'Puro', fonte: SANS_PESADA, estiloFonte: 'Bold', escala: 0.55, dx: -0.1, dy: 0.15, ancora: 'direita', cor: '#ffffff', entrada: 'fade' },
            { texto: 'luxo', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 1.9, dx: 0.05, dy: 0, ancora: 'esquerda', cor: '#7c4dff', entrada: 'pop', atraso: 0.1, principal: true,
                brilho: true, corBrilho: '#6a3dff', tamanhoBrilho: 18, intensidadeBrilho: 0.6 },
        ],
    },
    {
        id: 'c-riscado', nome: 'Riscado Criativo', tamanho: 0.08, saida: 'encolher',
        camadas: [
            { texto: 'Crie suas', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.5, dx: -2.35, dy: -1.02, ancora: 'esquerda', cor: '#ffffff', entrada: 'fade' },
            { texto: 'LEGENDAS', fonte: SANS_PESADA, estiloFonte: 'Black', escala: 1.0, dx: 0, dy: -0.1, cor: '#ffffff', entrada: 'pop', atraso: 0.06, principal: true },
            { segue: 1, linha: 'riscado', cor: '#ff2d3c', espessura: 0.1, entrada: 'riscar', atraso: 0.3 },
            { texto: 'com', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.5, dx: -0.35, dy: 0.85, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.2 },
            { texto: 'criatividade', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 0.9, dx: -0.2, dy: 0.82, ancora: 'esquerda', cor: '#ff3b5c', entrada: 'deslizar', atraso: 0.28, angulo: -4 },
        ],
    },
    {
        id: 'c-neon-aqui', nome: 'Neon Aqui', tamanho: 0.085, saida: 'encolher',
        camadas: [
            { texto: 'Digite seu texto', fonte: INTER, estiloFonte: 'Bold', escala: 0.36, dx: 0.6, dy: -1.15, cor: '#ffffff', entrada: 'fade' },
            { texto: 'BEM', fonte: INTER, estiloFonte: 'Black', escala: 1.55, dx: 0, dy: -0.25, cor: '#ffffff', tracking: 0.97, entrada: 'pop', atraso: 0.06, principal: true },
            { texto: 'AQUI', fonte: INTER, estiloFonte: 'Black', escala: 0.8, dx: 0, dy: 0.8, cor: '#2dff6e', entrada: 'subindo', atraso: 0.18,
                brilho: true, corBrilho: '#19ff5a', tamanhoBrilho: 16 },
        ],
    },
    {
        id: 'c-inclinado-azul', nome: 'Inclinado Azul', tamanho: 0.08, saida: 'fade',
        camadas: [
            { texto: 'Transforme suas', fonte: SANS_ITALICA, estiloFonte: 'Bold Italic', escala: 0.5, dx: -1.6, dy: -0.92, ancora: 'esquerda', cor: '#ffffff', angulo: 5, entrada: 'fade' },
            { texto: 'legendas', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 1.45, dx: 0, dy: 0, cor: '#5b7cff', angulo: 5, entrada: 'pop', atraso: 0.08, principal: true,
                brilho: true, corBrilho: '#3a63ff', tamanhoBrilho: 14, intensidadeBrilho: 0.8, sombra: true, opacidadeSombra: 0.5, suavidadeSombra: 8 },
            { texto: 'com criatividade', fonte: SANS_ITALICA, estiloFonte: 'Demi Bold Italic', escala: 0.5, dx: 1.45, dy: 0.88, ancora: 'direita', cor: '#ffffff', angulo: 5, entrada: 'fade', atraso: 0.2 },
        ],
    },
    {
        id: 'c-etiqueta-laranja', nome: 'Etiqueta Laranja', tamanho: 0.08, saida: 'descer',
        camadas: [
            { texto: 'Use', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.55, dx: -1.0, dy: -0.5, ancora: 'direita', cor: '#ffffff', entrada: 'fade' },
            { texto: 'VIRAL', fonte: SANS_PESADA, estiloFonte: 'Black', escala: 0.65, dx: 0, dy: -0.5, cor: '#ffffff', entrada: 'pop', atraso: 0.05 },
            { segue: 1, linha: 'riscado', cor: '#ff8a1f', espessura: 0.09, entrada: 'riscar', atraso: 0.25 },
            { texto: 'texto', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.55, dx: 1.0, dy: -0.5, ancora: 'esquerda', cor: '#ffffff', entrada: 'fade', atraso: 0.05 },
            { texto: 'ARRASTE E SOLTE', fonte: SANS_ITALICA, estiloFonte: 'Heavy Italic', escala: 0.62, dx: 0, dy: 0.45, cor: '#ffffff', entrada: 'pop', atraso: 0.15, principal: true,
                fundo: true, corFundo: '#e2620f', opacidadeFundo: 1, margemFundoX: 0.3, margemFundoY: 0.06, arredondarFundo: 0.35,
                sombra: true, opacidadeSombra: 0.6, suavidadeSombra: 4 },
        ],
    },
    {
        id: 'c-impacto-verde', nome: 'Impacto Verde', tamanho: 0.08, saida: 'encolher',
        camadas: [
            { texto: 'Textos com', fonte: SANS_ITALICA, estiloFonte: 'Medium Italic', escala: 0.5, dx: -2.1, dy: -0.95, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar' },
            { texto: 'IMPACTO', fonte: SANS_PESADA, estiloFonte: 'Black', escala: 1.25, dx: 0, dy: -0.12, cor: '#ffffff', tracking: 0.97, entrada: 'pop', atraso: 0.08, principal: true,
                sombra: true, opacidadeSombra: 0.7, suavidadeSombra: 3, sombraX: 0.03, sombraY: 0.05 },
            { texto: 'e', fonte: SANS_ITALICA, estiloFonte: 'Medium Italic', escala: 0.5, dx: -1.2, dy: 0.85, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.2 },
            { texto: 'PERSONALIDADE', fonte: SANS_ITALICA, estiloFonte: 'Heavy Italic', escala: 0.52, dx: -0.75, dy: 0.85, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar', atraso: 0.24,
                fundo: true, corFundo: '#1fae45', opacidadeFundo: 1, margemFundoX: 0.25, margemFundoY: 0.04, arredondarFundo: 0.3 },
        ],
    },
    {
        id: 'c-neon-engajante', nome: 'Neon Engajante', tamanho: 0.075, saida: 'fade',
        camadas: [
            { texto: 'Texto', fonte: SANS_ITALICA, estiloFonte: 'Medium', escala: 0.6, dx: -2.45, dy: -0.85, ancora: 'esquerda', cor: '#ffffff', entrada: 'fade' },
            { texto: 'ENGAJANTE', fonte: SANS_PESADA, estiloFonte: 'Black', escala: 1.05, dx: 0, dy: 0, cor: '#3dff6f', entrada: 'pop', atraso: 0.08, principal: true,
                brilho: true, corBrilho: '#16ff52', tamanhoBrilho: 18 },
            { texto: 'arraste e solte', fonte: SANS_ITALICA, estiloFonte: 'Medium Italic', escala: 0.56, dx: 2.45, dy: 0.85, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.2 },
            { segue: 2, linha: 'sublinhado', cor: '#3dff6f', espessura: 0.08, entrada: 'riscar', atraso: 0.35 },
        ],
    },
    {
        id: 'c-texto-videos', nome: 'Texto para Vídeos', tamanho: 0.08, saida: 'fade',
        camadas: [
            { texto: 'Viral', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.55, dx: 0.55, dy: -1.15, ancora: 'esquerda', cor: '#ffffff', entrada: 'fade' },
            { texto: 'Texto', fonte: SANS_PESADA, estiloFonte: 'Bold', escala: 1.65, dx: -0.15, dy: -0.25, cor: '#ffffff', entrada: 'pop', atraso: 0.06, principal: true },
            { texto: 'para seus', fonte: SANS_ITALICA, estiloFonte: 'Medium Italic', escala: 0.55, dx: -0.3, dy: 0.85, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.18 },
            { texto: 'vídeos', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 1.0, dx: -0.15, dy: 0.78, ancora: 'esquerda', cor: '#ff3355', entrada: 'deslizar', atraso: 0.24,
                sombra: true, opacidadeSombra: 0.6, suavidadeSombra: 6 },
        ],
    },
    {
        id: 'c-elegante', nome: 'Elegante Dourado', tamanho: 0.08, saida: 'fade',
        camadas: [
            { texto: 'Super', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.55, dx: 0.85, dy: -0.95, ancora: 'esquerda', cor: '#ffffff', entrada: 'fade' },
            { texto: 'Elegante', fonte: SERIFA_PESADA, estiloFonte: 'Black Italic', escala: 1.3, dx: 0, dy: -0.15, cor: '#f5b21b', entrada: 'pop', atraso: 0.06, principal: true,
                sombra: true, opacidadeSombra: 0.5, suavidadeSombra: 6 },
            { texto: 'texto', fonte: SANS, estiloFonte: 'SemiBold', escala: 0.55, dx: -0.2, dy: 0.82, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.18 },
            { texto: 'FÁCIL DE USAR', fonte: SANS_ITALICA, estiloFonte: 'Medium Italic', escala: 0.55, dx: -0.05, dy: 0.82, ancora: 'esquerda', cor: '#f5b21b', entrada: 'deslizar', atraso: 0.22 },
            { segue: 3, linha: 'sublinhado', cor: '#f5b21b', espessura: 0.07, entrada: 'riscar', atraso: 0.4 },
        ],
    },
    {
        id: 'c-espacado', nome: 'Espaçado Roxo', tamanho: 0.08, saida: 'subir',
        camadas: [
            { texto: 'CRIATIVOS', fonte: SERIFA_PESADA, estiloFonte: 'Black', escala: 1.1, dx: 0, dy: -0.2, cor: '#a487ff', tracking: 1.03, entrada: 'pop', principal: true,
                sombra: true, opacidadeSombra: 0.4, suavidadeSombra: 8 },
            { texto: 'mudam o mundo', fonte: SANS, estiloFonte: 'Medium', escala: 0.48, dx: 0, dy: 0.66, cor: '#ffffff', tracking: 1.3, entrada: 'fade', atraso: 0.2 },
        ],
    },
    {
        id: 'c-brilho-lilas', nome: 'Brilho Lilás', tamanho: 0.08, saida: 'fade',
        camadas: [
            { texto: 'Seja sempre', fonte: SANS_PESADA, estiloFonte: 'Bold', escala: 0.45, dx: 0.25, dy: -0.72, cor: '#ffffff', entrada: 'descendo' },
            { texto: 'criativo', fonte: SERIFA_PESADA, estiloFonte: 'Black', escala: 1.35, dx: 0, dy: 0.1, cor: '#b896ff', entrada: 'pop', atraso: 0.1, principal: true,
                brilho: true, corBrilho: '#a070ff', tamanhoBrilho: 22, intensidadeBrilho: 0.9 },
        ],
    },
    {
        id: 'c-numero-gancho', nome: 'Número Gancho', tamanho: 0.08, saida: 'encolher',
        camadas: [
            { texto: 'Roube', fonte: INTER, estiloFonte: 'Medium', escala: 0.55, dx: -1.75, dy: -0.78, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar' },
            { texto: 'estes', fonte: INTER, estiloFonte: 'Medium', escala: 0.55, dx: -1.75, dy: -0.18, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar', atraso: 0.06 },
            { texto: '20', fonte: INTER, estiloFonte: 'Black', escala: 1.6, dx: 0.35, dy: -0.5, ancora: 'esquerda', cor: '#b28dff', entrada: 'pop', atraso: 0.12, principal: true,
                brilho: true, corBrilho: '#9a6bff', tamanhoBrilho: 20 },
            { texto: 'Ganchos Virais', fonte: INTER, estiloFonte: 'Bold', escala: 0.62, dx: -1.75, dy: 0.45, ancora: 'esquerda', cor: '#ffffff', entrada: 'subindo', atraso: 0.22 },
        ],
    },
    {
        id: 'c-numero-lista', nome: 'Número Lista', tamanho: 0.08, saida: 'esquerda',
        camadas: [
            { texto: '7', fonte: INTER, estiloFonte: 'Black', escala: 1.55, dx: -1.75, dy: 0.02, ancora: 'direita', cor: '#ff2d2d', entrada: 'pop', principal: true },
            { texto: 'animações fáceis de usar', fonte: INTER, estiloFonte: 'Bold', escala: 0.52, dx: -1.6, dy: -0.3, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar', atraso: 0.08 },
            { texto: 'prontas para seus vídeos', fonte: INTER, estiloFonte: 'Bold', escala: 0.52, dx: -1.6, dy: 0.3, ancora: 'esquerda', cor: '#ffffff', entrada: 'deslizar', atraso: 0.14 },
        ],
    },
    {
        id: 'c-editores', nome: 'Para Editores', tamanho: 0.08, saida: 'fade',
        camadas: [
            { texto: 'Fácil de usar', fonte: INTER, estiloFonte: 'Medium', escala: 0.52, dx: -0.55, dy: -0.85, cor: '#ffffff', entrada: 'fade' },
            { texto: 'legendas', fonte: INTER, estiloFonte: 'Black', escala: 1.15, dx: 0, dy: -0.1, cor: '#ffffff', entrada: 'pop', atraso: 0.06, principal: true },
            { texto: 'para editores', fonte: INTER, estiloFonte: 'Medium', escala: 0.5, dx: -0.1, dy: 0.72, ancora: 'direita', cor: '#ffffff', entrada: 'fade', atraso: 0.18 },
            { texto: 'de vídeo', fonte: SERIFA_ITALICA, estiloFonte: 'Black Italic', escala: 0.9, dx: 0.05, dy: 0.76, ancora: 'esquerda', cor: '#f5a623', entrada: 'deslizar', atraso: 0.24 },
        ],
    },
];

// Completa cada template com os valores padrão
function listarTemplates() {
    return [
        ...TEMPLATES.map((t) => ({ ...PADRAO, ...t, embutido: true })),
        // composições: o texto (uma linha por camada) vem das camadas do template
        ...COMPOSICOES.map((t) => ({
            ...PADRAO, ...t, embutido: true, composicao: true,
            texto: t.camadas.filter((c) => c.segue === undefined).map((c) => c.texto).join('\n'),
        })),
    ];
}

module.exports = { TEMPLATES, COMPOSICOES, PADRAO, listarTemplates };
