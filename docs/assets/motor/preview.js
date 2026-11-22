// =============================================================================
// DaVinci Textos Virais - motor da tela de preview
// =============================================================================
//
// Desenha num <canvas> a mesma legenda que o plugin cria no Fusion, frame a frame,
// usando o MESMO "spec" (keyframes de estilos.js) que vai para o script Python.
// Assim o preview mostra exatamente a animação escolhida, sem precisar renderizar no Resolve.
//
// Medidas do Text+ calibradas no Resolve 21.2 (imagem 1920x1080):
//   - altura da linha (ascendente + descendente da fonte) = 0,8 x Size x largura da imagem
//   - o bloco de linhas fica centralizado no Center (y do Fusion cresce para cima)
//   - Text Box com largura 0,85 da imagem e quebra de palavras
//   - caixa de fundo: altura da linha + ExtendVertical x Size x largura (em cima e embaixo),
//     e 0,23 + ExtendHorizontal x Size x largura nas laterais
//   - contorno: raio = espessura / 2 x Size x largura
//   - Write On: o caractere i aparece quando Start x total <= i < End x total
//   - ordem dos elementos (de trás para frente): 5 caixa, 4 brilho, 3 sombra, 2 contorno, 1 texto
//   - deslocamento da sombra em tamanhos de texto (Size x largura); Y positivo = para cima
//   - Softness (sombra/brilho) ~ sigma do desfoque em px numa imagem de 1920 de largura
//   - layout "Point" (composições): âncora esquerda/direita = o texto começa/termina no Center
//   - Tracking: cada +1 soma um tamanho de texto entre as letras; AngleZ positivo = anti-horário
//   - Offset da caixa (barras) em larguras de imagem
// =============================================================================

(function () {
    'use strict';

    const LINHA_POR_SIZE = 0.8;      // altura da linha / (Size x largura)
    const LARGURA_CAIXA = 0.85;      // LayoutWidth usado pelo plugin
    const MARGEM_BASE_CAIXA = 0.23;  // folga horizontal da caixa com Extend = 0

    // ---- Interpolação dos keyframes (o Fusion usa curvas com alças lineares) ----

    function interpolar(keys, f) {
        if (!keys || !keys.length) return undefined;
        if (f <= keys[0][0]) return keys[0][1];
        const ultimo = keys[keys.length - 1];
        if (f >= ultimo[0]) return ultimo[1];
        for (let i = 0; i < keys.length - 1; i++) {
            const [f0, v0] = keys[i];
            const [f1, v1] = keys[i + 1];
            if (f >= f0 && f <= f1) {
                const t = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
                if (Array.isArray(v0)) return v0.map((v, j) => v + (v1[j] - v) * t);
                return v0 + (v1 - v0) * t;
            }
        }
        return ultimo[1];
    }

    // Valores de todos os inputs no frame f: começa pelos valores fixos e aplica as animações
    function estadoNoFrame(spec, animacoes, f) {
        const e = {
            Size: spec.tamanho,
            Center: spec.centro,
            Opacity1: 1,
            Opacity2: 1,
            Opacity3: spec.opacidadeSombra ?? 0.8,
            Opacity4: spec.intensidadeBrilho ?? 1,
            Opacity5: spec.opacidadeFundo ?? 0.85,
            Start: 0,
            End: 1,
        };
        for (const a of animacoes || []) {
            const v = interpolar(a.keys, f);
            if (v !== undefined) e[a.input] = v;
        }
        return e;
    }

    // ---- Fontes ---------------------------------------------------------------

    // Converte o estilo do Fusion ("Bold", "Black Italic", "Semi Bold"...) para CSS
    function fonteCss(spec, px) {
        const estilo = (spec.estiloFonte || '').toLowerCase().replace(/\s/g, '');
        let peso = 400;
        if (/black|heavy/.test(estilo)) peso = 900;
        else if (/extrabold|ultrabold/.test(estilo)) peso = 800;
        else if (/semibold|demibold/.test(estilo)) peso = 600;
        else if (/bold/.test(estilo)) peso = 700;
        else if (/medium/.test(estilo)) peso = 500;
        else if (/extralight|ultralight/.test(estilo)) peso = 200;
        else if (/thin/.test(estilo)) peso = 100;
        else if (/light/.test(estilo)) peso = 300;
        const italico = /italic|oblique/.test(estilo) ? 'italic ' : '';
        return `${italico}${peso} ${px.toFixed(2)}px "${spec.fonte}", sans-serif`;
    }

    // Métricas da fonte medidas a 100 px (cache por fonte)
    const cacheMetricas = new Map();
    function metricas(ctx, spec) {
        const chave = fonteCss(spec, 100);
        if (!cacheMetricas.has(chave)) {
            ctx.font = chave;
            const m = ctx.measureText('Hg');
            const asc = m.fontBoundingBoxAscent || 90;
            const desc = m.fontBoundingBoxDescent || 25;
            cacheMetricas.set(chave, { asc: asc / 100, desc: desc / 100 });
        }
        return cacheMetricas.get(chave);
    }

    // ---- Layout: quebra em linhas guardando o índice de cada caractere ----------

    function montarLinhas(ctx, texto, larguraMax) {
        const chars = [...texto];            // pontos de código, como o Fusion conta
        const linhas = [];
        let atual = { ini: 0, chars: [] };
        let ultimoEspaco = -1;               // posição (em atual.chars) do último espaço

        const larguraDe = (arr) => ctx.measureText(arr.join('')).width;

        chars.forEach((c, i) => {
            if (c === '\n') {
                linhas.push(atual);
                atual = { ini: i + 1, chars: [] };
                ultimoEspaco = -1;
                return;
            }
            atual.chars.push(c);
            if (c === ' ') ultimoEspaco = atual.chars.length - 1;
            if (c !== ' ' && larguraDe(atual.chars) > larguraMax && ultimoEspaco > 0) {
                // quebra no último espaço: o espaço "some" entre as linhas, mas conta no índice
                const resto = atual.chars.slice(ultimoEspaco + 1);
                linhas.push({ ini: atual.ini, chars: atual.chars.slice(0, ultimoEspaco) });
                atual = { ini: atual.ini + ultimoEspaco + 1, chars: resto };
                ultimoEspaco = atual.chars.lastIndexOf(' ');
            }
        });
        linhas.push(atual);
        return { linhas, total: chars.length };
    }

    // ---- Desenho ------------------------------------------------------------

    function rgba(cor, alfa) {
        const [r, g, b] = cor || [1, 1, 1];
        return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${Math.max(0, Math.min(1, alfa))})`;
    }

    function caixaArredondada(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, h / 2, w / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Calcula a posição de cada linha de uma camada (sem desenhar)
    function layoutCamada(ctx, W, H, spec, e) {
        const unidade = e.Size * W;                         // Size x largura
        const alturaLinha = LINHA_POR_SIZE * unidade;
        const m = metricas(ctx, spec);
        const px = alturaLinha / (m.asc + m.desc);         // tamanho da fonte em px
        if (px < 0.5) return null;
        ctx.font = fonteCss(spec, px);
        // Tracking do Text+: cada +1 acrescenta um "tamanho" (Size x largura) entre as letras
        const esp = ((spec.tracking ?? 1) - 1) * unidade;
        ctx.letterSpacing = `${esp}px`;
        const ponto = spec.layout === 'ponto';              // composições: sem quebra de linha
        const { linhas, total } = montarLinhas(ctx, spec.texto || '', ponto ? Infinity : (spec.largura ?? LARGURA_CAIXA) * W);
        const [cxN, cyN] = e.Center;
        const cx = cxN * W;
        const cy = (1 - cyN) * H;                           // y do Fusion cresce para cima
        const topoBloco = cy - (linhas.length * alturaLinha) / 2;
        linhas.forEach((linha, n) => {
            // o canvas soma o espaçamento também depois da última letra; o Fusion não
            linha.largura = Math.max(0, ctx.measureText(linha.chars.join('')).width - (linha.chars.length ? esp : 0));
            if (ponto && spec.ancora === 'esquerda') linha.x0 = cx;
            else if (ponto && spec.ancora === 'direita') linha.x0 = cx - linha.largura;
            else linha.x0 = cx - linha.largura / 2;
            linha.topo = topoBloco + n * alturaLinha;
            linha.baseline = linha.topo + m.asc * px;
        });
        return { unidade, alturaLinha, px, linhas, total, cx, cy, esp, angulo: spec.angulo || 0 };
    }

    // Gira o contexto em volta do Center da camada (ângulo do Fusion: positivo = anti-horário)
    function girar(ctx, lay) {
        if (!lay.angulo) return;
        ctx.translate(lay.cx, lay.cy);
        ctx.rotate(-lay.angulo * Math.PI / 180);
        ctx.translate(-lay.cx, -lay.cy);
    }

    // Desenha uma "camada" de Text+ (o texto base ou uma camada de destaque)
    function desenharCamada(ctx, W, H, spec, e, camada) {
        const lay = layoutCamada(ctx, W, H, spec, e);
        if (!lay) return;
        const { unidade, alturaLinha, px, linhas, total, esp } = lay;
        ctx.save();
        girar(ctx, lay);
        ctx.font = fonteCss(spec, px);
        ctx.letterSpacing = `${esp}px`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        // Faixa visível pelo Write On
        const iMin = e.Start * total;
        const iMax = e.End * total;
        const cor = camada.cor || spec.cor;
        const alfaTexto = spec.alphaTexto ?? 1;              // 0 nas barras (só a caixa aparece)
        // Softness do Fusion ~ sigma do desfoque em px (imagem de 1920); o blur do canvas usa 2 x sigma
        const escalaSuave = (W / 1920) * 2.0;

        // Desenha só o "efeito" de um texto: o texto vai para fora da tela e só a sombra entra
        const efeito = (texto, x, y, corEfeito, alfa, blur, dx, dy) => {
            const longe = W * 4;
            ctx.save();
            // a sombra do canvas não gira junto com o texto: desfaz a rotação no deslocamento
            const a = (lay.angulo || 0) * Math.PI / 180;
            ctx.shadowColor = rgba(corEfeito, alfa);
            ctx.shadowBlur = blur;
            ctx.shadowOffsetX = longe * Math.cos(a) + dx;
            ctx.shadowOffsetY = -longe * Math.sin(a) + dy;
            ctx.fillStyle = '#000';
            ctx.fillText(texto, x - longe, y);
            ctx.restore();
        };

        linhas.forEach((linha) => {
            // Caracteres visíveis desta linha
            const a = Math.max(0, Math.ceil(iMin - linha.ini - 1e-9));
            const b = Math.min(linha.chars.length, Math.ceil(iMax - linha.ini - 1e-9));
            if (b <= a) return;
            const textoVisivel = linha.chars.slice(a, b).join('');
            if (!textoVisivel.trim()) return;
            const xVis = linha.x0 + ctx.measureText(linha.chars.slice(0, a).join('')).width;
            const larguraVis = Math.max(0, ctx.measureText(textoVisivel).width - esp);
            const baseline = linha.baseline;

            if (camada.base) {
                // 5. Caixa de fundo (deslocamento em larguras de imagem, como no Fusion)
                if (spec.fundo && e.Opacity5 > 0) {
                    const mx = (MARGEM_BASE_CAIXA + (spec.margemFundoX ?? 0.25)) * unidade;
                    const my = (spec.margemFundoY ?? 0.1) * unidade;
                    const h = Math.max(1, alturaLinha + 2 * my);
                    const [ox, oy] = spec.deslocFundo || [0, 0];
                    ctx.fillStyle = rgba(spec.corFundo || [0, 0, 0], e.Opacity5);
                    caixaArredondada(ctx, xVis - mx + ox * W, linha.topo + alturaLinha / 2 - h / 2 - oy * W,
                        larguraVis + 2 * mx, h, (spec.arredondarFundo ?? 0.3) * h * 1.2);
                    ctx.fill();
                }
                if (alfaTexto > 0) {
                    // 4. Brilho (cópia desfocada do texto, na cor escolhida ou na do texto)
                    if (spec.brilho && e.Opacity4 > 0) {
                        efeito(textoVisivel, xVis, baseline, spec.corBrilho || spec.cor, e.Opacity4,
                            (spec.tamanhoBrilho ?? 14) * escalaSuave, 0, 0);
                    }
                    // 3. Sombra (Offset do Fusion em tamanhos de texto)
                    if (spec.sombra && e.Opacity3 > 0) {
                        const [dx, dy] = spec.deslocSombra || [0.03, -0.05];
                        efeito(textoVisivel, xVis, baseline, spec.corSombra || [0, 0, 0], e.Opacity3,
                            (spec.suavidadeSombra ?? 6) * escalaSuave, dx * unidade, -dy * unidade);
                    }
                }
            }
            if (alfaTexto <= 0) return;

            // 2. Contorno
            if (spec.contorno && e.Opacity2 > 0) {
                ctx.save();
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;
                ctx.lineWidth = (spec.espessuraContorno ?? 0.06) * unidade;
                ctx.strokeStyle = rgba(spec.corContorno || [0, 0, 0], e.Opacity2);
                ctx.strokeText(textoVisivel, xVis, baseline);
                ctx.restore();
            }

            // 1. Preenchimento
            if (e.Opacity1 > 0) {
                ctx.fillStyle = rgba(cor, e.Opacity1 * alfaTexto);
                ctx.fillText(textoVisivel, xVis, baseline);
            }
        });
        ctx.restore();
    }

    // Caixa que envolve o texto parado (Size e Center do formulário, sem animação), em px do canvas.
    // Em composições, junta todas as camadas (considerando a rotação de cada uma).
    function medirTexto(ctx, W, H, spec) {
        if (spec.camadas) {
            let caixa = null;
            for (const c of spec.camadas) {
                if ((c.alphaTexto ?? 1) <= 0) continue;
                const b = medirTexto(ctx, W, H, c);
                if (!b) continue;
                caixa = caixa ? { x0: Math.min(caixa.x0, b.x0), y0: Math.min(caixa.y0, b.y0),
                    x1: Math.max(caixa.x1, b.x1), y1: Math.max(caixa.y1, b.y1) } : b;
            }
            if (!caixa) return null;
            const [cx, cy] = spec.centro;
            return { ...caixa, cx: cx * W, cy: (1 - cy) * H };
        }
        const e = estadoNoFrame(spec, [], 0);
        const lay = layoutCamada(ctx, W, H, spec, e);
        if (!lay || !lay.linhas.length) return null;
        const a = -(lay.angulo || 0) * Math.PI / 180;
        const pontos = [];
        for (const l of lay.linhas) {
            for (const [x, y] of [[l.x0, l.topo], [l.x0 + l.largura, l.topo], [l.x0, l.topo + lay.alturaLinha], [l.x0 + l.largura, l.topo + lay.alturaLinha]]) {
                // gira o canto em volta do Center
                const dx = x - lay.cx;
                const dy = y - lay.cy;
                pontos.push([lay.cx + dx * Math.cos(a) - dy * Math.sin(a), lay.cy + dx * Math.sin(a) + dy * Math.cos(a)]);
            }
        }
        const xs = pontos.map((p) => p[0]);
        const ys = pontos.map((p) => p[1]);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), cx: lay.cx, cy: lay.cy };
    }

    // Frame em que a animação já "assentou" (texto inteiro, tamanho e posição finais).
    // Usado ao editar com o mouse, para a caixa de seleção coincidir com o texto.
    function frameValido(spec, f) {
        const e = estadoNoFrame(spec, spec.animacoes, f);
        const [x, y] = e.Center;
        return e.Opacity1 >= 0.99 && e.End >= 0.999 && e.Start <= 0.001
            && Math.abs(e.Size - spec.tamanho) < spec.tamanho * 0.005
            && Math.abs(x - spec.centro[0]) < 1e-3 && Math.abs(y - spec.centro[1]) < 1e-3;
    }

    function frameDeRepouso(spec, duracao) {
        const validos = [];
        for (let f = 0; f < duracao; f++) {
            const ok = spec.camadas ? spec.camadas.every((c) => frameValido(c, f)) : frameValido(spec, f);
            if (ok) validos.push(f);
        }
        return validos.length ? validos[Math.floor(validos.length / 2)] : Math.floor(duracao / 2);
    }

    // Desenha o frame f do spec inteiro (texto base + camadas de destaque; ou todas as camadas)
    function desenharFrame(ctx, W, H, spec, f) {
        if (spec.camadas) {
            for (const c of spec.camadas) desenharFrame(ctx, W, H, c, f);
            return;
        }
        const base = estadoNoFrame(spec, spec.animacoes, f);
        desenharCamada(ctx, W, H, spec, base, { base: true });

        const movimento = (spec.animacoes || []).filter((a) => a.input !== 'Start' && a.input !== 'End');
        for (const d of spec.destaques || []) {
            const e = estadoNoFrame(spec, movimento.concat(d.animacoes || []), f);
            if (d.inicio !== undefined) { e.Start = d.inicio; e.End = d.fim; }
            desenharCamada(ctx, W, H, spec, e, { cor: d.cor });
        }
    }

    // ---- Fundo ----------------------------------------------------------------

    function desenharFundo(ctx, W, H, imagem) {
        if (imagem && imagem.complete && imagem.naturalWidth) {
            // "cover": preenche a tela mantendo a proporção da imagem
            const s = Math.max(W / imagem.naturalWidth, H / imagem.naturalHeight);
            const w = imagem.naturalWidth * s;
            const h = imagem.naturalHeight * s;
            ctx.drawImage(imagem, (W - w) / 2, (H - h) / 2, w, h);
            return;
        }
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#3b4a5c');
        g.addColorStop(0.55, '#1f2730');
        g.addColorStop(1, '#3a2440');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // grade dos terços, como no visualizador do Resolve
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = Math.max(1, W / 640);
        ctx.beginPath();
        for (const t of [1 / 3, 2 / 3]) {
            ctx.moveTo(W * t, 0); ctx.lineTo(W * t, H);
            ctx.moveTo(0, H * t); ctx.lineTo(W, H * t);
        }
        ctx.stroke();
    }

    // ---- Player ----------------------------------------------------------------

    class PreviewLegendas {
        constructor(canvas, aoFrame) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.aoFrame = aoFrame || (() => {});
            this.spec = null;
            this.duracao = 72;
            this.fps = 24;
            this.pausaFinal = 0.5;   // segundos com a tela vazia antes de repetir
            this.imagem = null;
            this.inicio = performance.now();
            this.rodando = false;
            this.pausado = false;     // pausa do loop (botão ⏸): fica parado em framePausa
            this.framePausa = 0;
            this._loop = this._loop.bind(this);
        }

        // Define a resolução lógica (a da timeline) e o tamanho máximo na tela
        definirProporcao(largura, altura, larguraMax, alturaMax) {
            const escala = Math.min(larguraMax / largura, alturaMax / altura);
            const w = Math.round(largura * escala);
            const h = Math.round(altura * escala);
            const dpr = window.devicePixelRatio || 1;
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
            this.desenhar();
        }

        definirFundo(imagem) {
            this.imagem = imagem;
            this.desenhar();
        }

        // Troca a legenda mostrada e recomeça a animação do início
        mostrar(spec, duracao, fps, recomecar = true) {
            this.spec = spec;
            this.duracao = Math.max(1, Math.round(duracao));
            this.fps = fps || 24;
            if (recomecar) this.inicio = performance.now();
            // pausado: continua parado no mesmo quadro (agora com a legenda nova)
            if (this.pausado) this.framePausa = Math.min(this.framePausa, this.duracao - 1);
            // espera a fonte carregar para não desenhar com a fonte reserva
            if (spec && document.fonts && document.fonts.load) {
                document.fonts.load(fonteCss(spec, 40), spec.texto || 'A').then(() => {
                    cacheMetricas.clear();
                    this.desenhar();
                }).catch(() => {});
            }
            this.tocar();
        }

        recomecar() {
            this.pausado = false;
            this.inicio = performance.now();
            this.tocar();
        }

        // ---- Pausa do loop ----
        pausar() {
            if (this.pausado) return;
            this.framePausa = this.frameDoRelogio();
            this.pausado = true;
            this.desenhar();
        }

        continuar() {
            if (!this.pausado) return;
            // retoma do quadro em que parou
            this.inicio = performance.now() - (this.framePausa / this.fps) * 1000;
            this.pausado = false;
            this.tocar();
        }

        // vai para um quadro (só faz sentido pausado; usado pela barra de tempo e pelas teclas , .)
        irPara(frame) {
            const ciclo = this.duracao + Math.round(this.pausaFinal * this.fps);
            this.framePausa = Math.max(0, Math.min(ciclo - 1, Math.round(frame)));
            this.pausado = true;
            this.desenhar();
        }

        tocar() {
            if (!this.rodando) {
                this.rodando = true;
                requestAnimationFrame(this._loop);
            }
        }

        // Para a animação num frame fixo (edição com o mouse)
        congelar(frame) {
            this.congelado = frame;
            this.desenhar();
        }

        descongelar() {
            this.congelado = null;
            if (!this.pausado) this.inicio = performance.now();
            this.desenhar();
        }

        frameDeRepouso() {
            return this.spec ? frameDeRepouso(this.spec, this.duracao) : 0;
        }

        // Caixa do texto em px CSS (relativa ao canvas na tela)
        medirTexto(spec = this.spec) {
            if (!spec) return null;
            const dpr = this.canvas.width / (parseFloat(this.canvas.style.width) || this.canvas.width);
            const b = medirTexto(this.ctx, this.canvas.width, this.canvas.height, spec);
            if (!b) return null;
            return { x0: b.x0 / dpr, y0: b.y0 / dpr, x1: b.x1 / dpr, y1: b.y1 / dpr, cx: b.cx / dpr, cy: b.cy / dpr };
        }

        frameAtual() {
            if (this.congelado !== null && this.congelado !== undefined) return this.congelado;
            if (this.pausado) return this.framePausa;
            return this.frameDoRelogio();
        }

        frameDoRelogio() {
            const ciclo = this.duracao + Math.round(this.pausaFinal * this.fps);
            const f = Math.floor(((performance.now() - this.inicio) / 1000) * this.fps);
            return f % ciclo;
        }

        desenhar(f = this.frameAtual()) {
            const { ctx, canvas } = this;
            const W = canvas.width;
            const H = canvas.height;
            desenharFundo(ctx, W, H, this.imagem);
            if (this.spec && f < this.duracao) desenharFrame(ctx, W, H, this.spec, f);
            this.aoFrame(f, this.duracao);
        }

        _loop() {
            if (!this.rodando) return;
            this.desenhar();
            requestAnimationFrame(this._loop);
        }
    }

    // Exposto para o renderer.js (e para testes)
    window.PreviewLegendas = PreviewLegendas;
    window.PreviewLegendas.desenharFrame = desenharFrame;
    window.PreviewLegendas.desenharFundo = desenharFundo;
    window.PreviewLegendas.frameDeRepouso = frameDeRepouso;
})();
