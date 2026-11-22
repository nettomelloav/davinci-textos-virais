// =============================================================================
// DaVinci Textos Virais - estilos de animação
// =============================================================================
//
// Cada estilo é uma entrada do objeto ESTILOS. Para criar um estilo novo, copie um
// existente, troque a chave e o "nome" e devolva as animações desejadas.
//
// A função "gerar(ctx)" recebe o contexto da legenda:
//   ctx.dur        duração do clipe em frames
//   ctx.fps        frames por segundo da timeline
//   ctx.tamanho    tamanho do texto (input Size do Text+)
//   ctx.centro     [x, y] posição do texto (0..1)
//   ctx.texto      texto completo
//   ctx.palavras   lista de palavras com tempo: [{texto, ini, fim, charIni, charFim}]
//                  (ini/fim em frames relativos ao início do clipe)
//   ctx.corDestaque [r, g, b] cor de destaque (0..1)
//
// Sons (opcional):
//   som: { entrada: 'pop', palavra: 'clique' }   sons padrão do estilo (ids de sons/sons.json)
//   porPalavra(ctx) -> true se as palavras aparecem uma a uma (aí toca o som "palavra")
//
// e devolve:
//   {
//     animacoes: [ { input, tipo: 'numero' | 'ponto', keys: [[frame, valor], ...] } ],
//     destaques: [ { cor, inicio?, fim?, animacoes: [...] } ]   // camadas extras de Text+
//   }
//
// "input" é o ID do controle do Text+ no Fusion (Size, Center, Opacity1, End...).
// Os frames são relativos ao início do clipe (0 = primeiro frame).
// =============================================================================

// ---- Utilitários ------------------------------------------------------------

// Opacidade do texto inteiro, elemento por elemento do Text+:
//   1 preenchimento · 2 contorno · 3 sombra · 4 brilho · 5 caixa de fundo
// Sombra, brilho e caixa têm opacidade própria (ex.: sombra 0,8), então os keyframes
// deles são multiplicados por ela - um fade leva a sombra de 0 até 0,8, e não até 1.
function opacidade(keys, ctx) {
    const elementos = [
        { input: 'Opacity1', fator: 1 },
        { input: 'Opacity2', fator: 1 },
    ];
    if (ctx && ctx.sombra) elementos.push({ input: 'Opacity3', fator: ctx.opacidadeSombra });
    if (ctx && ctx.brilho) elementos.push({ input: 'Opacity4', fator: ctx.intensidadeBrilho });
    if (ctx && ctx.fundo) elementos.push({ input: 'Opacity5', fator: ctx.opacidadeFundo });
    return elementos.map(({ input, fator }) => ({
        input, tipo: 'numero', keys: keys.map(([f, v]) => [f, v * fator]),
    }));
}

// Keyframes "em degrau": o valor muda de uma vez no frame indicado (sem transição)
function degraus(passos, valorInicial) {
    const keys = [[0, valorInicial]];
    let anterior = valorInicial;
    for (const [frame, valor] of passos) {
        const f = Math.max(1, Math.round(frame));
        keys.push([f - 1, anterior]);
        keys.push([f, valor]);
        anterior = valor;
    }
    return limparKeys(keys);
}

// Remove keyframes duplicados no mesmo frame (fica o último)
function limparKeys(keys) {
    const mapa = new Map();
    for (const [f, v] of keys) mapa.set(Math.max(0, Math.round(f)), v);
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
}

// Comprimento do texto do jeito que o Fusion conta para o Write On: em pontos de código
// (um "é" acentuado conta como 1; emojis também contam como 1). Testado no Resolve 21.2.
function comprimentoFusion(s) {
    return [...String(s)].length;
}

// Fração do texto (0..1) para os controles Write On (Start / End) do Text+.
// O Fusion mostra o caractere i quando  Start*total <= i < End*total.  Usamos o MEIO do
// caractere (i - 0.5) como limite para não sofrer com arredondamento de ponto flutuante
// (ex.: 14/29*29 = 14,0000001 faria pular uma letra).
function fracao(ctx, indiceChar) {
    const total = Math.max(1, comprimentoFusion(ctx.texto));
    return Math.min(1, Math.max(0, (indiceChar - 0.5) / total));
}

// ---- Estilos ----------------------------------------------------------------

const ESTILOS = {
    pop: {
        nome: 'Pop (escala)',
        som: { entrada: 'pop', palavra: null },
        gerar(ctx) {
            const s = ctx.tamanho;
            return {
                animacoes: [
                    { input: 'Size', tipo: 'numero', keys: [[0, s * 0.3], [5, s * 1.15], [9, s]] },
                    ...opacidade([[0, 0], [3, 1]], ctx),
                ],
            };
        },
    },

    fade: {
        nome: 'Fade (opacidade)',
        som: { entrada: 'slide', palavra: null },
        saida: 'fade',   // saída padrão deste estilo (quando a saída está em "Automático")
        gerar(ctx) {
            const t = Math.min(8, Math.floor(ctx.dur / 3));
            return { animacoes: opacidade([[0, 0], [t, 1]], ctx) };
        },
    },

    subindo: {
        nome: 'Subindo (posição)',
        som: { entrada: 'swoosh', palavra: null },
        gerar(ctx) {
            const [x, y] = ctx.centro;
            return {
                animacoes: [
                    { input: 'Center', tipo: 'ponto', keys: [[0, [x, y - 0.06]], [10, [x, y]]] },
                    ...opacidade([[0, 0], [6, 1]], ctx),
                ],
            };
        },
    },

    descendo: {
        nome: 'Descendo (posição)',
        som: { entrada: 'swoosh', palavra: null },
        gerar(ctx) {
            const [x, y] = ctx.centro;
            return {
                animacoes: [
                    { input: 'Center', tipo: 'ponto', keys: [[0, [x, y + 0.06]], [10, [x, y]]] },
                    ...opacidade([[0, 0], [6, 1]], ctx),
                ],
            };
        },
    },

    deslizar: {
        nome: 'Deslizando da esquerda',
        som: { entrada: 'whoosh', palavra: null },
        gerar(ctx) {
            const [x, y] = ctx.centro;
            return {
                animacoes: [
                    { input: 'Center', tipo: 'ponto', keys: [[0, [x - 0.08, y]], [10, [x, y]]] },
                    ...opacidade([[0, 0], [6, 1]], ctx),
                ],
            };
        },
    },

    riscar: {
        nome: 'Escrevendo (contínuo)',
        som: { entrada: null, palavra: null },
        // Write On contínuo: em barras (riscado/sublinhado) a linha se desenha da esquerda p/ direita
        gerar: () => ({ animacoes: [{ input: 'End', tipo: 'numero', keys: [[0, 0], [10, 1]] }] }),
    },

    digitacao: {
        nome: 'Digitação (palavra por palavra)',
        som: { entrada: null, palavra: 'clique' },
        porPalavra: () => true,
        gerar(ctx) {
            // Write On "End": mostra o texto até o fim da palavra atual
            const passos = ctx.palavras.slice(1).map((p) => [p.ini, fracao(ctx, p.charFim)]);
            const primeira = ctx.palavras[0];
            const keys = degraus(passos, fracao(ctx, primeira ? primeira.charFim : ctx.texto.length));
            return { animacoes: [{ input: 'End', tipo: 'numero', keys }] };
        },
    },

    destaque: {
        nome: 'Palavra destacada (cor)',
        som: { entrada: 'pop', palavra: null },
        // karaokê (sem *asteriscos*): o destaque anda palavra por palavra
        porPalavra: (ctx) => !ctx.palavras.some((p) => p.marcada),
        gerar(ctx) {
            // Texto base normal + uma camada colorida que mostra só a palavra falada no
            // momento (karaokê). Palavras marcadas com *asteriscos* ficam destacadas o tempo todo.
            const s = ctx.tamanho;
            const animacoes = [
                { input: 'Size', tipo: 'numero', keys: [[0, s * 0.85], [5, s * 1.05], [8, s]] },
                ...opacidade([[0, 0], [3, 1]], ctx),
            ];
            const marcadas = ctx.palavras.filter((p) => p.marcada);
            if (marcadas.length) {
                return {
                    animacoes,
                    destaques: marcadas.map((p) => ({
                        cor: ctx.corDestaque, inicio: fracao(ctx, p.charIni), fim: fracao(ctx, p.charFim),
                    })),
                };
            }
            const p0 = ctx.palavras[0] || { charIni: 0, charFim: ctx.texto.length };
            const passosIni = ctx.palavras.slice(1).map((p) => [p.ini, fracao(ctx, p.charIni)]);
            const passosFim = ctx.palavras.slice(1).map((p) => [p.ini, fracao(ctx, p.charFim)]);
            return {
                animacoes,
                destaques: [{
                    cor: ctx.corDestaque,
                    animacoes: [
                        { input: 'Start', tipo: 'numero', keys: degraus(passosIni, fracao(ctx, p0.charIni)) },
                        { input: 'End', tipo: 'numero', keys: degraus(passosFim, fracao(ctx, p0.charFim)) },
                    ],
                }],
            };
        },
    },
};

// ---- Saídas ------------------------------------------------------------------
//
// A saída é escolhida à parte e combina com qualquer entrada. Cada saída recebe o contexto e
// o intervalo [ini, fim] (últimos frames do clipe) e devolve animações no mesmo formato das
// entradas. Os valores partem do "repouso" do texto (tamanho e posição do formulário).
// Para criar uma saída nova, copie uma entrada abaixo.
//   som: som padrão da saída (id de sons/sons.json)

const SAIDAS = {
    nenhuma: { nome: 'Nenhuma (corte seco)', gerar: () => [] },

    fade: {
        nome: 'Fade out',
        som: null,
        gerar: (ctx, ini, fim) => opacidade([[ini, 1], [fim, 0]], ctx),
    },

    encolher: {
        nome: 'Encolher (pop out)',
        som: 'bloop',
        gerar(ctx, ini, fim) {
            const s = ctx.tamanho;
            const pico = ini + Math.max(1, Math.round((fim - ini) * 0.3));
            return [
                { input: 'Size', tipo: 'numero', keys: [[ini, s], [pico, s * 1.12], [fim, s * 0.15]] },
                ...opacidade([[Math.max(pico, fim - 2), 1], [fim, 0]], ctx),
            ];
        },
    },

    descer: {
        nome: 'Descendo',
        som: 'whoosh',
        gerar(ctx, ini, fim) {
            const [x, y] = ctx.centro;
            return [
                { input: 'Center', tipo: 'ponto', keys: [[ini, [x, y]], [fim, [x, y - 0.08]]] },
                ...opacidade([[ini, 1], [fim, 0]], ctx),
            ];
        },
    },

    subir: {
        nome: 'Subindo',
        som: 'swoosh',
        gerar(ctx, ini, fim) {
            const [x, y] = ctx.centro;
            return [
                { input: 'Center', tipo: 'ponto', keys: [[ini, [x, y]], [fim, [x, y + 0.08]]] },
                ...opacidade([[ini, 1], [fim, 0]], ctx),
            ];
        },
    },

    esquerda: {
        nome: 'Deslizando para a esquerda',
        som: 'whoosh',
        gerar(ctx, ini, fim) {
            const [x, y] = ctx.centro;
            return [
                { input: 'Center', tipo: 'ponto', keys: [[ini, [x, y]], [fim, [x - 0.5, y]]] },
                ...opacidade([[ini + Math.round((fim - ini) / 2), 1], [fim, 0]], ctx),
            ];
        },
    },

    direita: {
        nome: 'Deslizando para a direita',
        som: 'whoosh',
        gerar(ctx, ini, fim) {
            const [x, y] = ctx.centro;
            return [
                { input: 'Center', tipo: 'ponto', keys: [[ini, [x, y]], [fim, [x + 0.5, y]]] },
                ...opacidade([[ini + Math.round((fim - ini) / 2), 1], [fim, 0]], ctx),
            ];
        },
    },

    apagar: {
        nome: 'Apagando (palavra por palavra)',
        som: null,
        // Write On "End" voltando palavra por palavra, da última para a primeira
        gerar(ctx, ini, fim) {
            const n = ctx.palavras.length;
            if (!n) return [];
            const passo = (fim - ini) / n;
            const passos = [];
            for (let k = 0; k < n; k++) {
                const restante = ctx.palavras[n - 1 - k];   // apaga esta palavra
                passos.push([ini + Math.round(passo * (k + 1)), fracao(ctx, restante.charIni)]);
            }
            return [{ input: 'End', tipo: 'numero', keys: limparKeys([[ini, 1], ...degrausDe(passos, 1, ini)]) }];
        },
    },
};

// Variante de degraus() que começa num frame qualquer
function degrausDe(passos, valorInicial, inicio) {
    const keys = [];
    let anterior = valorInicial;
    for (const [frame, valor] of passos) {
        const f = Math.max(inicio + 1, Math.round(frame));
        keys.push([f - 1, anterior]);
        keys.push([f, valor]);
        anterior = valor;
    }
    return keys;
}

// Junta as animações da saída com as da entrada: as da entrada valem até o início da saída
function juntarSaida(animacoes, animSaida, ini) {
    const resultado = animacoes.map((a) => ({ ...a }));
    for (const s of animSaida) {
        const i = resultado.findIndex((a) => a.input === s.input);
        if (i >= 0) {
            const antes = resultado[i].keys.filter(([f]) => f < ini);
            resultado[i].keys = limparKeys([...antes, ...s.keys]);
        } else {
            resultado.push(s);
        }
    }
    return resultado;
}

// Qual saída usar: 'auto' = a padrão do estilo
function idSaida(params, estilo) {
    const valor = params.saida || 'auto';
    if (valor === 'auto') return estilo.saida || 'nenhuma';
    return SAIDAS[valor] ? valor : 'nenhuma';
}

// ---- Composições (letterings com várias camadas) ---------------------------------
//
// Um template de composição tem "camadas". Cada camada é um texto com fonte, tamanho e
// efeitos próprios, posicionado em relação ao centro da composição:
//   texto, fonte, estiloFonte, cor, maiusculas
//   escala      tamanho em relação ao "Tamanho" do formulário (1 = igual)
//   dx, dy      deslocamento em TAMANHOS de texto (dy positivo = para baixo)
//   ancora      'esquerda' | 'centro' | 'direita' (ponto de apoio do texto em dx/dy)
//   tracking    espaçamento entre letras (1 = normal)
//   angulo      rotação em graus (positivo = anti-horário)
//   entrada     id de uma entrada (pop, fade, subindo, descendo, deslizar, riscar, ...)
//   atraso      segundos até a camada começar a entrar (efeito cascata)
//   contorno, sombra, brilho, fundo (+ cores e detalhes, como no formulário)
//   principal   true na camada usada quando a composição vira legenda simples (transcrição)
// Barras (riscado / sublinhado): uma camada com "segue: <índice da camada>" e "linha":
//   linha       'riscado' | 'sublinhado'
//   cor, espessura (em tamanhos de texto), extensao (sobra nas pontas), arredondar (0..1)
// A barra usa o mesmo texto da camada que segue: é a "caixa de fundo" do Text+ achatada.
//
// No formulário, cada LINHA do texto vira o texto de uma camada (as barras acompanham).

function atrasar(anim, d) {
    const mover = (a) => ({ ...a, keys: limparKeys([[0, a.keys[0][1]], ...a.keys.map(([f, v]) => [f + d, v])]) });
    anim.animacoes = (anim.animacoes || []).map(mover);
    anim.destaques = (anim.destaques || []).map((dst) => ({ ...dst, animacoes: (dst.animacoes || []).map(mover) }));
}

function indicePrincipal(camadas) {
    const i = camadas.findIndex((c) => c.principal);
    if (i >= 0) return i;
    let melhor = 0;
    camadas.forEach((c, k) => { if (c.segue === undefined && num(c.escala, 1) > num(camadas[melhor].escala, 1)) melhor = k; });
    return melhor;
}

function primeiraFonte(f) {
    return Array.isArray(f) ? f[0] : f;
}

function montarSpecComposicao(params, dur, fps, opcoes) {
    const camadas = params.camadas;
    const aspecto = opcoes.aspecto || 16 / 9;
    const T = num(params.tamanho, 0.06);
    const X = num(params.x, 0.5);
    const Y = num(params.y, 0.5);

    // linhas do formulário -> textos das camadas (as barras seguem a camada indicada)
    const linhas = String(params.texto || '').split('\n');
    const textos = [];
    let li = 0;
    camadas.forEach((c, i) => {
        if (c.segue !== undefined) return;
        const linha = linhas[li++];
        textos[i] = linha !== undefined && linha.trim() !== '' ? linha : c.texto;
    });
    const textoDe = (i) => (camadas[i].segue !== undefined ? textoDe(camadas[i].segue) : textos[i]);

    // geometria: a barra usa a da camada que ela segue
    const geo = (c) => (c.segue !== undefined ? camadas[c.segue] : c);
    const paramsDe = (c, i) => {
        const g = geo(c);
        const p = {
            ...c,
            camadas: undefined,
            texto: textoDe(i),
            fonte: primeiraFonte(c.fonte),
            estilo: c.entrada || 'fade',
            saida: params.saida, duracaoSaida: params.duracaoSaida,
            tamanho: T * num(g.escala, 1),
            x: X + num(g.dx, 0) * T,
            y: Y - num(g.dy, 0) * T * aspecto,
            sons: false,
        };
        if (c.segue !== undefined) {
            // barra: só a caixa de fundo, achatada na espessura pedida
            const esp = num(c.espessura, 0.12);
            Object.assign(p, {
                maiusculas: camadas[c.segue].maiusculas, fonte: primeiraFonte(camadas[c.segue].fonte),
                estiloFonte: camadas[c.segue].estiloFonte, tracking: camadas[c.segue].tracking,
                fundo: true, corFundo: c.cor || '#ff2d2d', opacidadeFundo: 1,
                margemFundoY: (esp - 0.8) / 2, margemFundoX: num(c.extensao, 0.05) - 0.23,
                arredondarFundo: num(c.arredondar, 0.6),
                contorno: false, sombra: false, brilho: false,
            });
        }
        return p;
    };
    const atrasoDe = (c) => Math.round(num(c.atraso, 0) * fps);

    // Fusion Titles: todas as camadas saem juntas, logo depois da última entrada
    let iniSaida;
    if (opcoes.saidaAposEntrada) {
        let fim = 0;
        camadas.forEach((c, i) => {
            const s = montarSpec({ ...paramsDe(c, i), saida: 'nenhuma' }, dur, fps, null, { atraso: atrasoDe(c) });
            fim = Math.max(fim, s.fimEntrada);
        });
        iniSaida = fim + 1;
    }

    const specs = camadas.map((c, i) => {
        const s = montarSpec(paramsDe(c, i), dur, fps, null, { atraso: atrasoDe(c), iniSaida, saidaAposEntrada: opcoes.saidaAposEntrada });
        s.layout = 'ponto';                      // sem quebra de linha; apoio pela âncora
        s.ancora = geo(c).ancora || 'centro';
        s.tracking = num(geo(c).tracking, 1);
        s.angulo = num(geo(c).angulo, 0);
        if (c.segue !== undefined) {
            s.segue = c.segue;
            s.alphaTexto = 0;                    // o texto da barra é invisível; só a caixa aparece
            // deslocamento da caixa no Fusion: em larguras de imagem (medido no Resolve 21.2)
            s.deslocFundo = [0, c.linha === 'sublinhado' ? -0.33 * s.tamanho : -0.02 * s.tamanho];
        }
        delete s.params;
        return s;
    });

    const iP = indicePrincipal(camadas);
    const principal = specs[iP];
    const estiloP = ESTILOS[camadas[iP].entrada] || ESTILOS.fade;
    const saida = principal.saida;
    return {
        composicao: true,
        camadas: specs,
        principal: iP,
        texto: camadas.map((c, i) => (c.segue === undefined ? textoDe(i) : null)).filter((t) => t !== null).join('\n'),
        fonte: principal.fonte, estiloFonte: principal.estiloFonte, cor: principal.cor,
        tamanho: T, centro: [X, Y],
        animacoes: [], destaques: [],
        saida,
        fimEntrada: Math.max(...specs.map((s) => s.fimEntrada || 0)),
        sons: sonsComposicao(params, camadas, iP, estiloP, saida, fps),
        volumeSom: Number(params.volumeSom ?? -8),
        params,
    };
}

// Sons de uma composição: cada camada toca o som da sua entrada no momento em que entra
// (camadas com "fade" e barras ficam em silêncio; sons a menos de 3 frames de outro são
// ignorados). A camada principal usa o "Som de entrada" do formulário; a saída, o "Som de saída".
function sonsComposicao(params, camadas, iP, estiloP, saida, fps) {
    if (params.sons === false) return [];
    const atrasoDe = (c) => Math.round(num(c.atraso, 0) * fps);
    const eventos = eventosSom(params, estiloP, { palavras: [] }, saida.id, saida.inicio)
        .map((ev) => (ev.frame === 0 ? { ...ev, frame: atrasoDe(camadas[iP]) } : ev));
    camadas.forEach((c, i) => {
        if (i === iP || c.segue !== undefined) return;
        const som = c.som !== undefined ? c.som : ((ESTILOS[c.entrada] || {}).som || {}).entrada;
        if (!som || c.entrada === 'fade' || som === 'nenhum') return;
        const frame = atrasoDe(c);
        if (eventos.some((ev) => Math.abs(ev.frame - frame) < 3)) return;
        eventos.push({ som, frame });
    });
    return eventos.sort((a, b) => a.frame - b.frame);
}

// Composição -> legenda simples com o visual da camada principal (usado na transcrição)
function camadaPrincipal(params) {
    if (!Array.isArray(params.camadas) || !params.camadas.length) return params;
    const c = params.camadas[indicePrincipal(params.camadas)];
    const p = { ...params, ...c, fonte: primeiraFonte(c.fonte), estilo: c.entrada || params.estilo,
        tamanho: num(params.tamanho, 0.06) * num(c.escala, 1) };
    delete p.camadas;
    delete p.composicaoNome;
    return p;
}

// ---- Palavras e tempos ------------------------------------------------------

// Divide o texto em palavras guardando a posição de cada uma (para o Write On) e
// distribui o tempo. Se "tempos" vier da transcrição, usa os tempos reais.
//   *palavra*  -> palavra marcada para destaque fixo (os asteriscos são removidos)
function prepararTexto(textoOriginal, dur, tempos) {
    const palavras = [];
    let texto = '';
    const partes = textoOriginal.split(/(\s+)/);
    for (const parte of partes) {
        if (!parte) continue;
        if (/^\s+$/.test(parte)) { texto += parte; continue; }
        const marcada = /^\*.+\*$/.test(parte);
        const limpa = marcada ? parte.slice(1, -1) : parte;
        const pos = comprimentoFusion(texto);
        palavras.push({ texto: limpa, charIni: pos, charFim: pos + comprimentoFusion(limpa), marcada });
        texto += limpa;
    }

    if (tempos && tempos.length === palavras.length) {
        palavras.forEach((p, i) => { p.ini = tempos[i].ini; p.fim = tempos[i].fim; });
    } else {
        // Sem tempos: distribui proporcionalmente ao tamanho das palavras em 80% da duração
        const util = Math.max(1, dur * 0.8);
        const totalChars = palavras.reduce((a, p) => a + p.texto.length + 1, 0) || 1;
        let acc = 0;
        for (const p of palavras) {
            p.ini = Math.round((acc / totalChars) * util);
            acc += p.texto.length + 1;
            p.fim = Math.round((acc / totalChars) * util);
        }
    }
    return { texto, palavras };
}

// ---- Conversões ------------------------------------------------------------

// Número do formulário com valor padrão (aceita 0)
function num(valor, padrao) {
    const n = Number(valor);
    return valor === undefined || valor === null || valor === '' || Number.isNaN(n) ? padrao : n;
}

function hexParaRgb(hex) {
    const h = (hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Monta o "spec" que o script Python usa para construir a composição Fusion.
//   params: valores da interface ({texto, estilo, fonte, estiloFonte, cor, corDestaque, tamanho, x, y,
//           maiusculas,
//           contorno, corContorno, espessuraContorno,
//           sombra, corSombra, opacidadeSombra, suavidadeSombra, sombraX, sombraY,
//           brilho, corBrilho, intensidadeBrilho, tamanhoBrilho,
//           fundo, corFundo, opacidadeFundo, margemFundoX, margemFundoY, arredondarFundo})
//   Campos ausentes usam os padrões abaixo (assim textos e templates antigos continuam iguais).
//   dur: duração em frames | fps | tempos: tempos das palavras (opcional)
//   opcoes.saidaAposEntrada: coloca a saída logo depois do fim da entrada (usado nos Fusion
//   Titles, onde um TimeStretcher segura o repouso e toca a saída no fim real do clipe)
//   opcoes.atraso: atrasa a entrada em N frames (camadas de uma composição entram em cascata)
//   opcoes.iniSaida: frame fixo de início da saída (todas as camadas saem juntas)
//   opcoes.aspecto: largura/altura do quadro (posiciona as camadas de uma composição)
function montarSpec(params, dur, fps, tempos, opcoes = {}) {
    if (Array.isArray(params.camadas) && params.camadas.length) {
        return montarSpecComposicao(params, dur, fps, opcoes);
    }
    const bruto = params.maiusculas ? (params.texto || '').toLocaleUpperCase('pt-BR') : (params.texto || '');
    const { texto, palavras } = prepararTexto(bruto, dur, tempos);
    const estilo = ESTILOS[params.estilo] || ESTILOS.pop;
    const ctx = {
        dur, fps, texto, palavras,
        tamanho: Number(params.tamanho) || 0.08,
        centro: [Number(params.x ?? 0.5), Number(params.y ?? 0.3)],
        corDestaque: hexParaRgb(params.corDestaque || '#ffd400'),
        sombra: !!params.sombra,
        opacidadeSombra: num(params.opacidadeSombra, 0.8),
        brilho: !!params.brilho,
        intensidadeBrilho: num(params.intensidadeBrilho, 1),
        fundo: !!params.fundo,
        opacidadeFundo: num(params.opacidadeFundo, 0.85),
    };
    const anim = estilo.gerar(ctx);
    if (opcoes.atraso > 0) atrasar(anim, Math.round(opcoes.atraso));
    // último frame com keyframe da entrada (texto base e camadas de destaque)
    let fimEntrada = 0;
    for (const a of (anim.animacoes || []).concat(...(anim.destaques || []).map((d) => d.animacoes || []))) {
        for (const [f] of a.keys) fimEntrada = Math.max(fimEntrada, f);
    }

    // Saída: ocupa os últimos frames do clipe (no máximo metade da duração)
    let saida = idSaida(params, estilo);
    // no estilo "palavra destacada" o destaque é uma camada separada: "apagar" vira fade
    if (saida === 'apagar' && params.estilo === 'destaque') saida = 'fade';
    const framesSaida = saida === 'nenhuma' ? 0
        : Math.max(2, Math.min(Math.floor(dur / 2), Math.round(num(params.duracaoSaida, 0.35) * fps)));
    let iniSaida = dur - framesSaida;
    if (opcoes.iniSaida !== undefined) iniSaida = opcoes.iniSaida;
    else if (opcoes.saidaAposEntrada) iniSaida = fimEntrada + 1;
    if (framesSaida) {
        const fimSaida = iniSaida + framesSaida - 1;
        anim.animacoes = juntarSaida(anim.animacoes || [], SAIDAS[saida].gerar(ctx, iniSaida, fimSaida), iniSaida);
    }

    return {
        ...anim,
        saida: { id: saida, frames: framesSaida, inicio: iniSaida },
        fimEntrada,
        sons: eventosSom(params, estilo, ctx, saida, iniSaida),
        volumeSom: Number(params.volumeSom ?? -8),
        texto,
        fonte: params.fonte || 'Open Sans',
        estiloFonte: params.estiloFonte || 'Bold',
        cor: hexParaRgb(params.cor),
        tamanho: ctx.tamanho,
        centro: ctx.centro,
        // contorno
        contorno: !!params.contorno,
        corContorno: hexParaRgb(params.corContorno || '#000000'),
        espessuraContorno: num(params.espessuraContorno, 0.06),
        // sombra: deslocamento em TAMANHOS DE TEXTO (como o Offset do Fusion); sombraY positivo =
        // para baixo na tela (no Fusion o Y cresce para cima, por isso o sinal invertido)
        sombra: ctx.sombra,
        corSombra: hexParaRgb(params.corSombra || '#000000'),
        opacidadeSombra: ctx.opacidadeSombra,
        suavidadeSombra: num(params.suavidadeSombra, 6),
        deslocSombra: [num(params.sombraX, 0.03), -num(params.sombraY, 0.05)],
        // brilho (sem cor própria = cor do texto)
        brilho: ctx.brilho,
        corBrilho: params.corBrilho ? hexParaRgb(params.corBrilho) : null,
        intensidadeBrilho: ctx.intensidadeBrilho,
        tamanhoBrilho: num(params.tamanhoBrilho, 14),
        // caixa de fundo
        fundo: ctx.fundo,
        corFundo: hexParaRgb(params.corFundo || '#000000'),
        opacidadeFundo: ctx.opacidadeFundo,
        margemFundoX: num(params.margemFundoX, 0.25),
        margemFundoY: num(params.margemFundoY, 0.1),
        arredondarFundo: num(params.arredondarFundo, 0.3),
        animacoes: anim.animacoes || [],
        destaques: anim.destaques || [],
        params, // salvo na composição para "Carregar do selecionado"
    };
}

// Eventos de som: [{som: id, frame}] com frames relativos ao início do clipe.
//   params.sons === false      -> sem sons
//   params.somEntrada/somPalavra/somSaida: 'auto' (padrão do estilo/saída), 'nenhum' ou o id de um som
function eventosSom(params, estilo, ctx, saida, iniSaida) {
    if (params.sons === false) return [];
    const padrao = estilo.som || {};
    const escolher = (valor, pad) => {
        if (valor === 'nenhum') return null;
        if (!valor || valor === 'auto') return pad || null;
        return valor;
    };
    const eventos = [];
    const entrada = escolher(params.somEntrada, padrao.entrada);
    if (entrada) eventos.push({ som: entrada, frame: 0 });
    const palavra = escolher(params.somPalavra, padrao.palavra);
    if (palavra && estilo.porPalavra && estilo.porPalavra(ctx)) {
        ctx.palavras.forEach((p, i) => {
            if (i === 0 && entrada) return;   // a primeira palavra já tem o som de entrada
            eventos.push({ som: palavra, frame: Math.max(0, Math.round(p.ini)) });
        });
    }
    // som de saída: 'auto' = som padrão da saída escolhida
    if (saida && saida !== 'nenhuma') {
        const somSaida = escolher(params.somSaida, (SAIDAS[saida] || {}).som);
        if (somSaida) eventos.push({ som: somSaida, frame: iniSaida });
    }
    return eventos;
}

function listarEstilos() {
    return Object.entries(ESTILOS).map(([id, e]) => ({
        id, nome: e.nome, som: e.som || {}, porPalavra: !!e.porPalavra, saida: e.saida || 'nenhuma',
    }));
}

function listarSaidas() {
    return Object.entries(SAIDAS).map(([id, s]) => ({ id, nome: s.nome, som: s.som || null }));
}

module.exports = { ESTILOS, SAIDAS, montarSpec, listarEstilos, listarSaidas, prepararTexto, hexParaRgb, camadaPrincipal };
