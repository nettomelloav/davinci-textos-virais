// =============================================================================
// DaVinci Textos Virais — página oficial
// O viewer e a galeria usam o MESMO motor do preview do plugin (estilos.js + preview.js)
// para desenhar as animações reais de cada template.
// =============================================================================
(function () {
    'use strict';

    const E = window.module.exports;           // estilos.js (montarSpec)
    const P = window.PreviewLegendas;          // preview.js (desenharFrame, frameDeRepouso...)
    const T = window.TEMPLATES || [];
    const FPS = 30;
    const $ = (s) => document.querySelector(s);

    // ---------------------------------------------------------------- download
    const cfg = window.CONFIG || {};
    const urlDownload = `https://github.com/${cfg.repo}/releases/latest/download/${cfg.arquivo}`;
    const urlRepo = `https://github.com/${cfg.repo}`;
    // o botão da barra de navegação rola até a seção de download; os outros baixam direto
    document.querySelectorAll('[data-download]').forEach((a) => {
        a.href = a.closest('.nav') ? '#baixar' : urlDownload;
    });
    if ($('#linkCodigo')) $('#linkCodigo').href = urlRepo + '/releases';
    if ($('#versao') && cfg.versao) $('#versao').textContent = 'v' + cfg.versao;

    // ------------------------------------------------------------------ fontes
    function pesoItalico(estilo) {
        const e = String(estilo || '').toLowerCase().replace(/\s/g, '');
        const tab = [['black', 900], ['heavy', 900], ['extrabold', 800], ['semibold', 600], ['demibold', 600],
            ['bold', 700], ['medium', 500], ['light', 300]];
        const a = tab.find(([k]) => e.includes(k));
        return `${/italic|oblique/.test(e) ? 'italic ' : ''}${a ? a[1] : 400}`;
    }
    function carregarFontes() {
        const pedidos = new Set();
        for (const t of T) {
            if (t.camadas) for (const c of t.camadas) { if (c.fonte) pedidos.add(`${pesoItalico(c.estiloFonte)} 40px "${c.fonte}"`); }
            else pedidos.add(`${pesoItalico(t.estiloFonte)} 40px "${t.fonte}"`);
        }
        const espera = new Promise((r) => setTimeout(r, 2500));   // não trava se a rede demorar
        return Promise.race([Promise.all([...pedidos].map((f) => document.fonts.load(f).catch(() => {}))), espera]);
    }

    // ------------------------------------------------------- specs dos templates
    function specDe(t, aspecto = 16 / 9) {
        const params = { ...t, duracao: 3.2, sons: true };
        const dur = Math.round(params.duracao * FPS);
        return { spec: E.montarSpec(params, dur, FPS, null, { aspecto }), dur };
    }

    // "Vídeo" de fundo do viewer: gradiente com manchas de luz em movimento + vinheta
    function fundoVideo(ctx, W, H, t) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#1b2433');
        g.addColorStop(0.55, '#121722');
        g.addColorStop(1, '#2a1a33');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const manchas = [
            [0.25, 0.35, '#ff4d3d', 0.18], [0.75, 0.3, '#8b6cff', 0.2], [0.55, 0.8, '#22d3ee', 0.12],
        ];
        manchas.forEach(([x, y, cor, a], i) => {
            const cx = (x + Math.sin(t * 0.35 + i * 2) * 0.08) * W;
            const cy = (y + Math.cos(t * 0.28 + i) * 0.08) * H;
            const r = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.42);
            r.addColorStop(0, hexA(cor, a));
            r.addColorStop(1, hexA(cor, 0));
            ctx.fillStyle = r;
            ctx.fillRect(0, 0, W, H);
        });
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,.55)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
    }
    function hexA(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    // ================================================================== viewer
    const viewer = $('#viewer');
    const vctx = viewer.getContext('2d');
    const destaque = ['c-riscado', 'c-neon-engajante', 'c-elegante', 'karaoke-amarelo', 'c-impacto-verde',
        'c-inclinado-azul', 'neon', 'c-numero-gancho', 'reels-classico', 'c-luxo', 'c-etiqueta-laranja', 'c-brilho-lilas'];
    const demo = destaque.map((id) => T.find((t) => t.id === id)).filter(Boolean);
    let atual = 0;
    let estado = null;          // { t, spec, dur, ciclo, inicio }
    let segundosTotais = 0;     // para o timecode correr sem voltar
    let visivel = true;

    function selecionar(i) {
        atual = (i + demo.length) % demo.length;
        const t = demo[atual];
        const { spec, dur } = specDe(t);
        estado = { t, spec, dur, ciclo: dur + Math.round(FPS * 0.7), inicio: performance.now() };
        $('#nomeClipe').textContent = t.nome;
        $('#clipeTexto').textContent = 'T: ' + t.nome;
        $('#clipeTexto').parentElement.style.setProperty('--fim', (dur / estado.ciclo) * 100 + '%');
        $('#clipeTexto').style.right = (100 - (dur / estado.ciclo) * 100) + '%';
        montarSfx();
        montarRegua();
        document.querySelectorAll('.chip').forEach((c, k) => c.classList.toggle('ativo', k === atual));
    }

    function montarRegua() {
        const regua = $('#regua');
        regua.innerHTML = '';
        const passos = 8;
        for (let k = 0; k <= passos; k++) {
            const p = k / passos;
            const f = Math.round(p * estado.ciclo);
            const s = document.createElement('span');
            s.style.left = (p * 100) + '%';
            s.textContent = tc(f, 0).slice(6);
            const i = document.createElement('i');
            i.style.left = (p * 100) + '%';
            regua.append(s, i);
        }
    }

    function montarSfx() {
        const area = $('#sfx');
        area.innerHTML = '';
        for (const ev of estado.spec.sons || []) {
            const b = document.createElement('div');
            b.className = 'sfx';
            b.dataset.frame = ev.frame;
            b.style.left = (Math.max(0, ev.frame) / estado.ciclo) * 100 + '%';
            b.style.width = Math.max(3.5, (FPS * 0.25 / estado.ciclo) * 100) + '%';
            b.textContent = ev.som;
            area.appendChild(b);
        }
    }

    function tc(frame, base = 3600 * FPS) {
        const f = base + frame;
        const h = Math.floor(f / (3600 * FPS));
        const m = Math.floor(f / (60 * FPS)) % 60;
        const s = Math.floor(f / FPS) % 60;
        const q = f % FPS;
        const d = (n) => String(n).padStart(2, '0');
        return `${d(h)}:${d(m)}:${d(s)}:${d(q)}`;
    }

    function desenharOnda() {
        const c = $('#onda');
        const x = c.getContext('2d');
        x.clearRect(0, 0, c.width, c.height);
        let semente = 7;
        const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
        x.fillStyle = '#39d98a';
        for (let i = 0; i < c.width; i += 3) {
            const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 37) * Math.cos(i / 91));
            const h = Math.max(1, rnd() * env * c.height * 0.9);
            x.fillRect(i, (c.height - h) / 2, 2, h);
        }
    }

    function quadroViewer(agora) {
        if (estado && visivel) {
            let f = Math.floor(((agora - estado.inicio) / 1000) * FPS);
            if (f >= estado.ciclo) {
                segundosTotais += estado.ciclo;
                selecionar(atual + 1);
                f = 0;
            }
            const W = viewer.width;
            const H = viewer.height;
            fundoVideo(vctx, W, H, agora / 1000);
            if (f < estado.dur) P.desenharFrame(vctx, W, H, estado.spec, f);
            const p = f / estado.ciclo;
            $('#agulha').style.left = `calc(46px + (100% - 56px) * ${p})`;
            $('#timecode').textContent = tc(segundosTotais + f);
            document.querySelectorAll('.sfx').forEach((b) => {
                const fr = Number(b.dataset.frame);
                b.classList.toggle('tocando', f >= fr && f < fr + 8);
            });
        }
        requestAnimationFrame(quadroViewer);
    }

    function montarBin() {
        const bin = $('#bin');
        demo.forEach((t, i) => {
            const c = document.createElement('button');
            c.className = 'chip';
            c.textContent = t.nome;
            c.addEventListener('click', () => { selecionar(i); });
            bin.appendChild(c);
        });
    }

    // ================================================================= galeria
    let animando = null;   // { canvas, spec, dur, inicio }

    function desenharCartao(canvas, spec, f) {
        const ctx = canvas.getContext('2d');
        P.desenharFundo(ctx, canvas.width, canvas.height, null);
        P.desenharFrame(ctx, canvas.width, canvas.height, spec, f);
    }

    function montarGaleria(filtro = 'todos') {
        const g = $('#galeria');
        g.innerHTML = '';
        // letterings primeiro (são as peças mais marcantes)
        const lista = [...T.filter((t) => t.camadas), ...T.filter((t) => !t.camadas)]
            .filter((t) => filtro === 'todos' || (filtro === 'composicoes' ? t.camadas : !t.camadas));
        for (const t of lista) {
            const card = document.createElement('div');
            card.className = 'cartao';
            card.tabIndex = 0;
            const cv = document.createElement('canvas');
            cv.width = 640;
            cv.height = 360;
            const rot = document.createElement('div');
            rot.className = 'rotulo';
            rot.innerHTML = `<span></span><span class="tag ${t.camadas ? 'lettering' : ''}">${t.camadas ? 'lettering' : 'legenda'}</span>`;
            rot.firstChild.textContent = t.nome;
            card.append(cv, rot);
            g.appendChild(card);
            // na miniatura o texto fica maior e centralizado, para ser legível no cartão
            const ampliado = t.camadas ? { ...t, tamanho: t.tamanho * 1.7, x: 0.5, y: 0.5 }
                : { ...t, tamanho: t.tamanho * 1.9, x: 0.5, y: 0.5 };
            const { spec, dur } = specDe(ampliado);
            const repouso = P.frameDeRepouso(spec, dur);
            desenharCartao(cv, spec, repouso);
            const tocar = () => {
                document.querySelectorAll('.cartao.tocando').forEach((c) => c.classList.remove('tocando'));
                card.classList.add('tocando');
                animando = { canvas: cv, spec, dur, inicio: performance.now(), repouso, card };
            };
            const parar = () => {
                if (animando && animando.canvas === cv) {
                    desenharCartao(cv, spec, repouso);
                    card.classList.remove('tocando');
                    animando = null;
                }
            };
            card.addEventListener('mouseenter', tocar);
            card.addEventListener('focus', tocar);
            card.addEventListener('mouseleave', parar);
            card.addEventListener('blur', parar);
            card.addEventListener('click', () => {
                const i = demo.findIndex((d) => d.id === t.id);
                if (i >= 0) { selecionar(i); }
                else { demo.push(t); montarChipExtra(t); selecionar(demo.length - 1); }
                document.getElementById('topo').scrollIntoView({ behavior: 'smooth' });
            });
        }
    }

    function montarChipExtra(t) {
        const c = document.createElement('button');
        c.className = 'chip';
        c.textContent = t.nome;
        const i = demo.length - 1;
        c.addEventListener('click', () => selecionar(i));
        $('#bin').appendChild(c);
    }

    function quadroGaleria(agora) {
        if (animando) {
            const ciclo = animando.dur + Math.round(FPS * 0.6);
            const f = Math.floor(((agora - animando.inicio) / 1000) * FPS) % ciclo;
            const ctx = animando.canvas.getContext('2d');
            P.desenharFundo(ctx, animando.canvas.width, animando.canvas.height, null);
            if (f < animando.dur) P.desenharFrame(ctx, animando.canvas.width, animando.canvas.height, animando.spec, f);
        }
        requestAnimationFrame(quadroGaleria);
    }

    document.querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('.filtro').forEach((x) => x.classList.toggle('ativo', x === b));
        montarGaleria(b.dataset.filtro);
    }));

    // pausa o viewer quando ele sai da tela (economiza bateria)
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((ent) => { visivel = ent[0].isIntersecting; }).observe(viewer);
    }

    // --------------------------------------------------------------- café (Pix)
    async function copiar(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch (_) {
            // reserva para navegadores sem a API de área de transferência
            const t = document.createElement('textarea');
            t.value = texto;
            t.style.position = 'fixed';
            t.style.opacity = '0';
            document.body.appendChild(t);
            t.select();
            const ok = document.execCommand('copy');
            t.remove();
            return ok;
        }
    }
    const pix = window.PIX;
    if (pix && $('#copiarPix')) {
        const aviso = $('#pixAviso');
        const avisar = (ok, msg) => {
            aviso.textContent = ok ? msg : 'Não consegui copiar. Selecione e copie a chave manualmente.';
            aviso.classList.toggle('ok', ok);
        };
        $('#copiarPix').addEventListener('click', async () => avisar(await copiar(pix.copiaECola),
            '✔ Pix copia e cola copiado! Abra o app do banco › Pix › Pix copia e cola e cole.'));
        $('#copiarChave').addEventListener('click', async () => avisar(await copiar(pix.chave.replace(/\D/g, '')),
            '✔ Chave Pix (CPF) copiada!'));
    }

    // ----------------------------------------------------------------- início
    carregarFontes().then(() => {
        montarBin();
        desenharOnda();
        selecionar(0);
        montarGaleria();
        requestAnimationFrame(quadroViewer);
        requestAnimationFrame(quadroGaleria);
    });
})();
