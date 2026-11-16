// =============================================================================
// DaVinci Textos Virais - interface (renderer)
// Roda na janela, sem acesso ao Node. Fala com o main.js via window.legendas (preload.js).
// =============================================================================

const $ = (id) => document.getElementById(id);
const api = window.legendas;

// Campos do formulário que formam os "params" de um texto
const CAMPOS = ['texto', 'estilo', 'duracao', 'saida', 'duracaoSaida', 'fonte', 'estiloFonte', 'cor', 'corDestaque', 'maiusculas',
    'tamanho', 'x', 'y', 'timecode',
    // efeitos
    'contorno', 'corContorno', 'espessuraContorno',
    'sombra', 'corSombra', 'opacidadeSombra', 'suavidadeSombra', 'sombraX', 'sombraY',
    'brilho', 'corBrilho', 'intensidadeBrilho', 'tamanhoBrilho',
    'fundo', 'corFundo', 'opacidadeFundo', 'margemFundoX', 'margemFundoY', 'arredondarFundo',
    // sons
    'sons', 'somEntrada', 'somPalavra', 'somSaida', 'volumeSom'];

let fontes = {};     // { familia: [estilos] }
let templates = [];  // templates prontos + salvos pelo usuário
let templateAtivo = null;
// Composição ativa (template de várias camadas): { nome, camadas } ou null.
// Com ela ativa, cada LINHA do campo Texto vira o texto de uma camada.
let composicaoAtiva = null;

// ---- Status --------------------------------------------------------------

function status(msg, tipo = '') {
    const el = $('status');
    el.textContent = msg;
    el.className = tipo;
}

// Executa uma ação desabilitando os botões enquanto ela roda
async function executar(botao, rotulo, acao) {
    const botoes = document.querySelectorAll('button');
    botoes.forEach((b) => { b.disabled = true; });
    status(rotulo + '...');
    try {
        const r = await acao();
        if (r && r.ok === false) throw new Error(r.erro);
        return r;
    } catch (e) {
        status('Erro: ' + e.message, 'erro');
        return null;
    } finally {
        botoes.forEach((b) => { b.disabled = false; });
    }
}

function relatar(r, verbo) {
    if (!r) return;
    const partes = [`${r.inseridos} texto(s) ${verbo}.`];
    if (r.erros.length) partes.push(`${r.erros.length} erro(s): ${r.erros[0]}`);
    if (r.avisos.length) partes.push(r.avisos[0]);
    status(partes.join(' '), r.erros.length ? 'erro' : 'ok');
}

// ---- Formulário <-> params -------------------------------------------------

function lerParams() {
    const p = {};
    for (const c of CAMPOS) {
        const el = $(c);
        if (el.type === 'checkbox') p[c] = el.checked;
        else if (el.type === 'range' || el.type === 'number') p[c] = parseFloat(el.value);
        else p[c] = el.value;
    }
    // brilho "na mesma cor do texto" = sem cor própria
    if ($('brilhoCorTexto').checked) p.corBrilho = '';
    if (composicaoAtiva) {
        p.camadas = composicaoAtiva.camadas;
        p.composicaoNome = composicaoAtiva.nome;
    }
    return p;
}

function preencher(p) {
    for (const c of ['somEntrada', 'somPalavra', 'somSaida', 'saida']) {
        if (p[c] !== undefined && ![...$(c).options].some((o) => o.value === p[c])) p = { ...p, [c]: 'auto' };
    }
    for (const c of CAMPOS) {
        if (p[c] === undefined) continue;
        if (c === 'corBrilho') {
            $('brilhoCorTexto').checked = !p.corBrilho;
            if (p.corBrilho) $('corBrilho').value = p.corBrilho;
            continue;
        }
        const el = $(c);
        if (el.type === 'checkbox') el.checked = !!p[c];
        else el.value = p[c];
    }
    atualizarPesos(p.estiloFonte);
    atualizarSaidas();
}

// Liga/desliga a composição ativa e mostra o aviso acima do campo Texto
function definirComposicao(comp) {
    composicaoAtiva = comp && comp.camadas && comp.camadas.length
        ? { nome: comp.nome, camadas: comp.camadas.map((c) => ({ ...c })) } : null;
    const aviso = $('avisoComposicao');
    aviso.hidden = !composicaoAtiva;
    document.body.classList.toggle('com-composicao', !!composicaoAtiva);
    if (composicaoAtiva) {
        const n = composicaoAtiva.camadas.filter((c) => c.segue === undefined).length;
        $('nomeComposicao').textContent = composicaoAtiva.nome || 'Composição';
        $('linhasComposicao').textContent = `${n} ${n === 1 ? 'linha' : 'linhas'}`;
        $('texto').rows = Math.max(3, n);
    } else {
        $('texto').rows = 3;
    }
    desenharPainelCamadas();
}

// Mostra o valor ao lado de cada slider (formato em data-formato do <output>) e abre os
// controles de cada efeito ligado
const FORMATOS = {
    n1: (v) => v.toFixed(1), n2: (v) => v.toFixed(2), n3: (v) => v.toFixed(3),
    pct: (v) => Math.round(v * 100) + '%', db: (v) => `${Math.round(v)} dB`,
};
function atualizarSaidas() {
    for (const el of document.querySelectorAll('input[type=range]')) {
        const saida = document.querySelector(`label[for="${el.id}"] output`);
        if (saida) saida.textContent = (FORMATOS[saida.dataset.formato] || FORMATOS.n2)(Number(el.value));
    }
    for (const id of ['contorno', 'sombra', 'brilho', 'fundo']) {
        $(id).closest('.efeito').classList.toggle('ligado', $(id).checked);
    }
    $('corBrilho').disabled = $('brilhoCorTexto').checked;
    $('opcoesSom').classList.toggle('desligado', !$('sons').checked);
    atualizarRotulosSom();
}

// Preenche o menu "Peso" com os estilos da fonte escolhida (Regular, Bold...)
function atualizarPesos(pedido) {
    const sel = $('estiloFonte');
    const atual = pedido || sel.value;
    let estilos = fontes[$('fonte').value];
    if (!estilos) {
        // fonte ainda não carregada (ou digitada à mão): mantém o peso pedido como opção
        estilos = [...new Set(['Regular', 'Bold', atual].filter(Boolean))];
    }
    sel.innerHTML = '';
    for (const e of estilos) sel.add(new Option(e, e));
    sel.value = estilos.includes(atual) ? atual : (estilos.find((e) => /^bold$/i.test(e)) || estilos.find((e) => /bold/i.test(e)) || estilos[0]);
    atualizarBotaoFonte();
}

// ---- Seletor de fontes ------------------------------------------------------
//
// Lista TODAS as fontes que o Fusion reconhece (FontManager), cada uma desenhada na
// própria fonte, com busca. Substitui o antigo campo com "datalist", que só mostrava as
// fontes parecidas com o texto já digitado.

let fontesCarregadas = false;
let erroFontes = '';
let indiceAtivo = -1;

function atualizarBotaoFonte() {
    const nome = $('fonte').value;
    $('nomeFonte').textContent = nome;
    $('nomeFonte').style.fontFamily = `"${nome}", sans-serif`;
}

function nomesFiltrados() {
    const termo = $('buscaFonte').value.trim().toLowerCase();
    const todos = Object.keys(fontes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return termo ? todos.filter((n) => n.toLowerCase().includes(termo)) : todos;
}

function desenharListaFontes() {
    const lista = $('listaFontes');
    lista.innerHTML = '';
    const nomes = nomesFiltrados();
    const atual = $('fonte').value;
    nomes.forEach((nome, i) => {
        const op = document.createElement('div');
        op.className = 'opcao-fonte' + (nome === atual ? ' escolhida' : '') + (i === indiceAtivo ? ' ativa' : '');
        op.setAttribute('role', 'option');
        op.dataset.nome = nome;
        const rotulo = document.createElement('span');
        rotulo.className = 'nome';
        rotulo.textContent = nome;
        rotulo.style.fontFamily = `"${nome}", sans-serif`;
        const qtd = document.createElement('span');
        qtd.className = 'qtd';
        const n = (fontes[nome] || []).length;
        qtd.textContent = `${n} ${n === 1 ? 'estilo' : 'estilos'}`;
        op.append(rotulo, qtd);
        op.addEventListener('mousedown', (ev) => { ev.preventDefault(); escolherFonteNoSeletor(nome); });
        lista.appendChild(op);
    });
    const total = Object.keys(fontes).length;
    const termo = $('buscaFonte').value.trim();
    if (!fontesCarregadas) {
        $('rodapeFontes').textContent = erroFontes ? `Erro ao ler as fontes: ${erroFontes}` : 'Carregando as fontes do DaVinci...';
    } else if (!nomes.length) {
        $('rodapeFontes').textContent = termo ? `Nenhuma fonte com "${termo}". Enter usa o nome digitado.` : 'Nenhuma fonte.';
    } else {
        $('rodapeFontes').textContent = termo ? `${nomes.length} de ${total} fontes` : `${total} fontes disponíveis no DaVinci`;
    }
}

function abrirSeletorFonte() {
    $('painelFontes').hidden = false;
    $('btnFonte').setAttribute('aria-expanded', 'true');
    $('buscaFonte').value = '';
    indiceAtivo = nomesFiltrados().indexOf($('fonte').value);
    desenharListaFontes();
    $('buscaFonte').focus();
    const escolhida = $('listaFontes').querySelector('.escolhida');
    if (escolhida) escolhida.scrollIntoView({ block: 'center' });
}

function fecharSeletorFonte() {
    $('painelFontes').hidden = true;
    $('btnFonte').setAttribute('aria-expanded', 'false');
}

function escolherFonteNoSeletor(nome) {
    $('fonte').value = nome;
    fecharSeletorFonte();
    atualizarPesos();
    $('fonte').dispatchEvent(new Event('change'));   // atualiza preview e templates
    $('btnFonte').focus();
}

function iniciarSeletorFonte() {
    atualizarBotaoFonte();
    $('btnFonte').addEventListener('click', () => ($('painelFontes').hidden ? abrirSeletorFonte() : fecharSeletorFonte()));
    $('buscaFonte').addEventListener('input', () => { indiceAtivo = 0; desenharListaFontes(); $('listaFontes').scrollTop = 0; });
    $('buscaFonte').addEventListener('keydown', (ev) => {
        const nomes = nomesFiltrados();
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            indiceAtivo = Math.max(0, Math.min(nomes.length - 1, indiceAtivo + (ev.key === 'ArrowDown' ? 1 : -1)));
            desenharListaFontes();
            const ativa = $('listaFontes').querySelector('.ativa');
            if (ativa) ativa.scrollIntoView({ block: 'nearest' });
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const nome = nomes[indiceAtivo] || nomes[0] || $('buscaFonte').value.trim();
            if (nome) escolherFonteNoSeletor(nome);
        } else if (ev.key === 'Escape') {
            fecharSeletorFonte();
            $('btnFonte').focus();
        }
    });
    document.addEventListener('mousedown', (ev) => {
        if (!$('painelFontes').hidden && !ev.target.closest('.seletor-fonte')) fecharSeletorFonte();
    });
}

// ---- Templates -------------------------------------------------------------

// Primeira fonte da lista que está instalada (o template pode sugerir várias)
function escolherFonte(lista) {
    const opcoes = Array.isArray(lista) ? lista : [lista];
    if (!Object.keys(fontes).length) return opcoes[0];
    return opcoes.find((f) => fontes[f]) || null;
}

// Peso CSS aproximado para a miniatura
function pesoCss(estiloFonte = '') {
    const e = estiloFonte.toLowerCase().replace(/\s/g, '');
    if (/black|heavy/.test(e)) return 900;
    if (/extrabold|ultrabold/.test(e)) return 800;
    if (/semibold|demibold/.test(e)) return 600;
    if (/bold/.test(e)) return 700;
    if (/medium/.test(e)) return 500;
    if (/light|thin/.test(e)) return 300;
    return 400;
}

function hexRgba(hex, alfa) {
    const n = parseInt((hex || '#000000').slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

// Monta o cartão de um template com uma miniatura que imita o visual final
function cartaoTemplate(t) {
    const cartao = document.createElement('div');
    cartao.className = 'template' + (t.id === templateAtivo ? ' ativo' : '');
    cartao.setAttribute('role', 'button');
    cartao.tabIndex = 0;
    cartao.title = t.nome;

    const amostra = document.createElement('div');
    amostra.className = 'amostra';
    if (t.camadas) {
        // composição: miniatura desenhada pelo motor do preview
        const tela = document.createElement('canvas');
        tela.width = 248;
        tela.height = 108;
        tela.className = 'mini';
        amostra.appendChild(tela);
        desenharMiniaturaComposicao(tela, paramsDoTemplate(t).params);
        return montarCartao(cartao, amostra, t);
    }
    const span = document.createElement('span');
    const minha = $('manterFonte').checked;
    const fonte = minha ? $('fonte').value : (escolherFonte(t.fonte) || 'sans-serif');
    span.style.fontFamily = `"${fonte}", sans-serif`;
    span.style.fontWeight = pesoCss(minha ? $('estiloFonte').value : t.estiloFonte);
    if (/italic|oblique/i.test(minha ? $('estiloFonte').value : t.estiloFonte || '')) span.style.fontStyle = 'italic';
    span.style.color = t.cor;
    if (t.maiusculas) span.style.textTransform = 'uppercase';
    const sombras = [];
    if (t.contorno) {
        span.style.webkitTextStroke = `${Math.max(1, Math.round((t.espessuraContorno ?? 0.06) * 50))}px ${t.corContorno || '#000'}`;
        span.style.paintOrder = 'stroke fill';
    }
    if (t.sombra) sombras.push(`${(t.sombraX ?? 0.03) * 15}px ${(t.sombraY ?? 0.05) * 15 + 1}px ${(t.suavidadeSombra ?? 6) / 1.5}px ${hexRgba(t.corSombra || '#000000', t.opacidadeSombra ?? 0.8)}`);
    if (t.brilho) {
        const corB = t.corBrilho || t.cor;
        sombras.push(`0 0 6px ${corB}`, `0 0 12px ${corB}`);
    }
    span.style.textShadow = sombras.join(', ');
    if (t.fundo) {
        span.style.background = hexRgba(t.corFundo, t.opacidadeFundo ?? 0.85);
        span.style.borderRadius = `${Math.round((t.arredondarFundo ?? 0.3) * 12)}px`;
    }

    if (t.estilo === 'destaque') {
        span.append('Seu ');
        const palavra = document.createElement('b');
        palavra.textContent = 'texto';
        palavra.style.color = t.corDestaque;
        palavra.style.fontWeight = 'inherit';
        span.append(palavra, ' aqui');
    } else {
        span.textContent = t.modo === 'palavra' ? 'Texto' : 'Seu texto';
    }
    amostra.appendChild(span);
    return montarCartao(cartao, amostra, t);
}

// Nome, botão de excluir e eventos do cartão
function montarCartao(cartao, amostra, t) {

    const nome = document.createElement('div');
    nome.className = 'nome';
    nome.textContent = t.nome;
    if (!t.embutido) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = ' · meu';
        nome.appendChild(tag);
    }
    cartao.append(amostra, nome);

    // Templates do usuário podem ser excluídos
    if (!t.embutido) {
        const excluir = document.createElement('button');
        excluir.className = 'excluir';
        excluir.textContent = '×';
        excluir.title = 'Excluir template';
        excluir.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!confirm(`Excluir o template "${t.nome}"?`)) return;
            const r = await api.excluirTemplate(t.id);
            if (r.ok) { templates = r.templates; desenharTemplates(); status('Template excluído.', 'ok'); }
        });
        cartao.appendChild(excluir);
    }

    const aplicar = () => aplicarTemplate(t);
    cartao.addEventListener('click', aplicar);
    // Passar o mouse (ou focar com o teclado) mostra a animação do template na tela de preview
    cartao.addEventListener('mouseenter', () => previewTemplate(t, cartao));
    cartao.addEventListener('focus', () => previewTemplate(t, cartao));
    cartao.addEventListener('mouseleave', () => sairPreviewTemplate(cartao));
    cartao.addEventListener('blur', () => sairPreviewTemplate(cartao));
    cartao.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aplicar(); } });
    return cartao;
}

function desenharTemplates() {
    const galeria = $('templates');
    galeria.innerHTML = '';
    const grupos = [
        ['Legendas', templates.filter((t) => !t.camadas)],
        ['Composições (letterings)', templates.filter((t) => t.camadas)],
    ];
    for (const [titulo, lista] of grupos) {
        if (!lista.length) continue;
        const h = document.createElement('div');
        h.className = 'grupo-templates';
        h.textContent = titulo;
        galeria.appendChild(h);
        for (const t of lista) galeria.appendChild(cartaoTemplate(t));
    }
}

// Preenche o formulário com os valores do template (texto e timecode ficam como estão)
// Valores do template prontos para o formulário (a fonte vira a primeira instalada)
// Peso (100-900) e itálico de um estilo de fonte ("Black Italic", "SemiBold"...)
function pesoItalico(estilo) {
    const e = String(estilo || '').toLowerCase().replace(/\s/g, '');
    const italico = /italic|oblique/.test(e);
    const tabela = [['black', 900], ['heavy', 900], ['extrabold', 800], ['ultrabold', 800], ['semibold', 600],
        ['demibold', 600], ['bold', 700], ['medium', 500], ['extralight', 200], ['ultralight', 200],
        ['thin', 100], ['hairline', 100], ['light', 300]];
    const achado = tabela.find(([k]) => e.includes(k));
    return [achado ? achado[1] : 400, italico];
}

// Estilo da fonte mais parecido com o pedido (evita "Fonts Not Found" no Resolve)
function estiloMaisProximo(fonte, desejado) {
    const estilos = fontes[fonte];
    if (!estilos || !estilos.length || estilos.includes(desejado)) return desejado;
    const [peso, italico] = pesoItalico(desejado);
    let melhor = estilos[0];
    let menor = Infinity;
    for (const e of estilos) {
        const [p, i] = pesoItalico(e);
        const custo = (i === italico ? 0 : 1000) + Math.abs(p - peso);
        if (custo < menor) { menor = custo; melhor = e; }
    }
    return melhor;
}

// Camadas com a fonte de cada uma trocada pela primeira instalada (ou a do formulário),
// sempre com um estilo que essa fonte realmente tem
function resolverCamadas(camadas) {
    return camadas.map((c) => {
        if (c.segue !== undefined || !c.fonte) return { ...c };
        const fonte = $('manterFonte').checked ? $('fonte').value
            : (escolherFonte(Array.isArray(c.fonte) ? c.fonte : [c.fonte]) || $('fonte').value);
        return { ...c, fonte, estiloFonte: estiloMaisProximo(fonte, c.estiloFonte || 'Bold') };
    });
}

// ---- Painel "Camadas": fonte, peso e cor de cada linha de uma composição ----------

function opcoesFonte(sel, atual) {
    sel.innerHTML = '';
    const nomes = Object.keys(fontes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (atual && !nomes.includes(atual)) nomes.unshift(atual);
    for (const n of nomes) sel.add(new Option(n, n));
    sel.value = atual;
}

function opcoesPeso(sel, fonte, atual) {
    sel.innerHTML = '';
    const estilos = fontes[fonte] || [atual];
    for (const e of estilos) sel.add(new Option(e, e));
    sel.value = estilos.includes(atual) ? atual : estiloMaisProximo(fonte, atual);
}

function desenharPainelCamadas() {
    const painel = $('painelCamadas');
    painel.innerHTML = '';
    if (!composicaoAtiva) return;
    const linhas = $('texto').value.split('\n');
    const camadas = composicaoAtiva.camadas;
    let k = 0;
    const numeroDa = [];
    camadas.forEach((c, i) => { if (c.segue === undefined) numeroDa[i] = ++k; });

    // fonte em todas as linhas de uma vez
    const todas = document.createElement('div');
    todas.className = 'linha camada-todas';
    const selTodas = document.createElement('select');
    selTodas.add(new Option('Fonte em todas as linhas…', ''));
    for (const n of Object.keys(fontes).sort((a, b) => a.localeCompare(b, 'pt-BR'))) selTodas.add(new Option(n, n));
    selTodas.addEventListener('change', () => {
        const f = selTodas.value;
        if (!f) return;
        for (const c of camadas) {
            if (c.segue !== undefined) continue;
            c.fonte = f;
            c.estiloFonte = estiloMaisProximo(f, c.estiloFonte || 'Bold');
        }
        desenharPainelCamadas();
        agendarFormulario(false);
    });
    todas.appendChild(selTodas);
    painel.appendChild(todas);

    camadas.forEach((c, i) => {
        const bloco = document.createElement('div');
        bloco.className = 'camada';
        const titulo = document.createElement('div');
        titulo.className = 'camada-titulo';
        const cor = document.createElement('input');
        cor.type = 'color';
        cor.value = c.cor || '#ffffff';
        cor.title = 'Cor';
        cor.addEventListener('input', () => { c.cor = cor.value; agendarFormulario(false); });
        if (c.segue !== undefined) {
            titulo.textContent = `${c.linha === 'sublinhado' ? 'Sublinhado' : 'Riscado'} da linha ${numeroDa[c.segue]}`;
            const linha = document.createElement('div');
            linha.className = 'linha';
            linha.append(titulo, cor);
            bloco.append(linha);
            painel.appendChild(bloco);
            return;
        }
        const n = numeroDa[i];
        titulo.innerHTML = '';
        titulo.append(`Linha ${n} `);
        const amostra = document.createElement('span');
        amostra.className = 'camada-texto';
        amostra.textContent = (linhas[n - 1] || c.texto || '').slice(0, 28);
        amostra.style.fontFamily = `"${c.fonte}", sans-serif`;
        titulo.appendChild(amostra);
        const selFonte = document.createElement('select');
        opcoesFonte(selFonte, c.fonte);
        const selPeso = document.createElement('select');
        opcoesPeso(selPeso, c.fonte, c.estiloFonte);
        c.estiloFonte = selPeso.value;
        selFonte.addEventListener('change', () => {
            c.fonte = selFonte.value;
            opcoesPeso(selPeso, c.fonte, c.estiloFonte);
            c.estiloFonte = selPeso.value;
            amostra.style.fontFamily = `"${c.fonte}", sans-serif`;
            agendarFormulario(false);
        });
        selPeso.addEventListener('change', () => { c.estiloFonte = selPeso.value; agendarFormulario(false); });
        const linha = document.createElement('div');
        linha.className = 'linha';
        selFonte.className = 'camada-fonte';
        linha.append(selFonte, selPeso, cor);
        bloco.append(titulo, linha);
        painel.appendChild(bloco);
    });
}

// Em quadros verticais (9:16, 4:5) as composições ficam maiores: o Tamanho é relativo à largura
const FATOR_RETRATO = 1.8;

function paramsDoTemplate(t, aspecto = aspectoPreview()) {
    const params = {};
    for (const c of CAMPOS) {
        if (c === 'texto' || c === 'timecode' || t[c] === undefined) continue;
        params[c] = t[c];
    }
    if (t.camadas) {
        if (aspecto < 1 && t.embutido) params.tamanho = Number(t.tamanho) * FATOR_RETRATO;
        params.camadas = resolverCamadas(t.camadas);
        params.composicaoNome = t.nome;
        params.texto = t.texto;
        delete params.fonte;
        delete params.estiloFonte;
        return { params, fonteFaltando: false };
    }
    if ($('manterFonte').checked) {
        // "Usar a minha fonte em todos os templates": o template não troca fonte nem peso
        delete params.fonte;
        delete params.estiloFonte;
        return { params, fonteFaltando: false };
    }
    if (params.estiloFonte) {
        const f = escolherFonte(t.fonte);
        if (f) params.estiloFonte = estiloMaisProximo(f, params.estiloFonte);
    }
    const fonte = escolherFonte(t.fonte);
    if (fonte) params.fonte = fonte;
    else delete params.fonte;
    return { params, fonteFaltando: !fonte };
}

function aplicarTemplate(t) {
    const { params, fonteFaltando } = paramsDoTemplate(t);
    const aviso = fonteFaltando ? ` (fonte ${[].concat(t.fonte).join('/')} não instalada; mantive a atual)` : '';
    if (t.camadas) {
        $('texto').value = params.texto;     // uma linha por camada (antes do painel, que usa as linhas)
        definirComposicao({ nome: t.nome, camadas: params.camadas });
    } else if (composicaoAtiva) {
        definirComposicao(null);
        $('texto').value = $('texto').value.split('\n').filter((l) => l.trim()).join(' ');
    }
    preencher(params);
    if (t.modo) $('modo').value = t.modo;
    if (t.maxPalavras) $('maxPalavras').value = t.maxPalavras;
    templateAtivo = t.id;
    desenharTemplates();
    status(`Template "${t.nome}" aplicado. Clique em Aplicar ou Atualizar selecionado.${aviso}`, aviso ? 'erro' : 'ok');
    mostrarFormulario(true);
}

async function salvarTemplate() {
    const nome = $('nomeTemplate').value.trim();
    if (!nome) { $('nomeTemplate').focus(); return status('Digite um nome para o template.', 'erro'); }
    const params = { ...lerParams(), modo: $('modo').value, maxPalavras: parseInt($('maxPalavras').value, 10) };
    const r = await api.salvarTemplate(nome, params);
    if (!r.ok) return status('Erro: ' + r.erro, 'erro');
    templates = r.templates;
    templateAtivo = r.id;
    desenharTemplates();
    $('nomeTemplate').value = '';
    status(`Template "${nome}" salvo.`, 'ok');
}

// ---- Efeitos sonoros --------------------------------------------------------
//
// Os sons são tocados no preview com Web Audio, nos mesmos frames em que entram na timeline.

let estilosInfo = {};          // id do estilo -> { nome, som: {entrada, palavra}, porPalavra, saida }
let saidasInfo = {};           // id da saída -> { nome, som }
let catalogoSons = [];         // [{id, nome, antecipar, meu}]
let audio = null;              // AudioContext (criado na primeira vez que precisar)
const buffersSom = new Map();  // id -> Promise<AudioBuffer>
let somNoPreview = true;
let eventosPreview = [];       // [{som, frame}] já com a antecipação aplicada
let volumePreview = -8;
let ultimoFrame = -1;

function nomeSom(id) {
    const s = catalogoSons.find((x) => x.id === id);
    return s ? s.nome : 'nenhum';
}

// Preenche os menus de som: Automático (padrão do estilo), Nenhum e a lista de sons
function montarMenusSom() {
    for (const campo of ['somEntrada', 'somPalavra', 'somSaida']) {
        const sel = $(campo);
        const atual = sel.value || 'auto';
        sel.innerHTML = '';
        sel.add(new Option('Automático', 'auto'));
        sel.add(new Option('Nenhum', 'nenhum'));
        const prontos = document.createElement('optgroup');
        prontos.label = 'Sons do plugin';
        const meus = document.createElement('optgroup');
        meus.label = 'Meus sons';
        for (const s of catalogoSons) (s.meu ? meus : prontos).appendChild(new Option(s.nome, s.id));
        sel.appendChild(prontos);
        if (meus.children.length) sel.appendChild(meus);
        sel.value = [...sel.options].some((o) => o.value === atual) ? atual : 'auto';
    }
    atualizarRotulosSom();
}

// Mostra qual som o "Automático" vai usar no estilo escolhido
function atualizarRotulosSom() {
    const info = estilosInfo[$('estilo').value] || {};
    const padrao = info.som || {};
    const ent = $('somEntrada').options[0];
    const pal = $('somPalavra').options[0];
    if (ent) ent.textContent = `Automático (${padrao.entrada ? nomeSom(padrao.entrada) : 'nenhum'})`;
    if (pal) pal.textContent = `Automático (${padrao.palavra ? nomeSom(padrao.palavra) : 'nenhum'})`;
    const sai = $('somSaida').options[0];
    const somDaSaida = (saidasInfo[saidaEscolhida()] || {}).som;
    if (sai) sai.textContent = `Automático (${somDaSaida ? nomeSom(somDaSaida) : 'nenhum'})`;
    const autoSaida = $('saida').options[0];
    if (autoSaida) autoSaida.textContent = `Automático (${(saidasInfo[info.saida || 'nenhuma'] || {}).nome || 'nenhuma'})`;
    $('dicaPalavra').textContent = info.porPalavra ? '' : '(só em Digitação e Palavra destacada)';
}

// Saída efetiva: "Automático" usa a saída padrão do estilo de entrada
function saidaEscolhida() {
    const v = $('saida').value;
    return !v || v === 'auto' ? ((estilosInfo[$('estilo').value] || {}).saida || 'nenhuma') : v;
}

function somEscolhido(campo) {
    const valor = $(campo).value;
    if (valor === 'nenhum') return null;
    if (valor === 'auto') {
        if (campo === 'somSaida') return (saidasInfo[saidaEscolhida()] || {}).som || null;
        const padrao = (estilosInfo[$('estilo').value] || {}).som || {};
        return campo === 'somEntrada' ? padrao.entrada : padrao.palavra;
    }
    return valor;
}

function contextoAudio() {
    if (!audio) audio = new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
}

function carregarSom(id) {
    if (!buffersSom.has(id)) {
        buffersSom.set(id, (async () => {
            const r = await api.dadosSom(id);
            if (!r.ok) throw new Error(r.erro);
            const bin = atob(r.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return contextoAudio().decodeAudioData(bytes.buffer);
        })().catch((e) => { buffersSom.delete(id); console.warn('som', id, e); return null; }));
    }
    return buffersSom.get(id);
}

// Toca um som; "pular" (segundos) começa no meio do som (usado na antecipação)
async function tocarSom(id, volumeDb, pular = 0) {
    if (!id) return;
    const buffer = await carregarSom(id);
    if (!buffer) return;
    const ctx = contextoAudio();
    const fonte = ctx.createBufferSource();
    const ganho = ctx.createGain();
    fonte.buffer = buffer;
    ganho.gain.value = Math.pow(10, volumeDb / 20);
    fonte.connect(ganho).connect(ctx.destination);
    fonte.start(0, Math.min(Math.max(0, pular), buffer.duration));
}

// Recebe os eventos do spec e aplica a antecipação de cada som
function definirEventosPreview(spec, fps) {
    const porId = new Map(catalogoSons.map((s) => [s.id, s]));
    eventosPreview = (spec.sons || []).map((ev) => {
        const s = porId.get(ev.som);
        return s ? { som: ev.som, frame: ev.frame - Math.round(s.antecipar * fps) } : null;
    }).filter(Boolean);
    volumePreview = spec.volumeSom ?? -8;
    for (const ev of eventosPreview) carregarSom(ev.som);
}

// Chamado a cada quadro desenhado: toca os sons cujos frames foram alcançados
function sonsDoFrame(f) {
    if (!somNoPreview || !eventosPreview.length || f === ultimoFrame) return;
    const ciclo = preview.duracao + Math.round(preview.pausaFinal * preview.fps);
    const reinicio = ultimoFrame < 0;
    const passou = (alvo) => {
        const g = ((alvo % ciclo) + ciclo) % ciclo;   // sons antecipados caem no fim do ciclo anterior
        if (ultimoFrame < 0) return false;
        return ultimoFrame < f ? g > ultimoFrame && g <= f : g > ultimoFrame || g <= f;
    };
    for (const ev of eventosPreview) {
        if (reinicio && ev.frame < 0) {
            // recomeçou do zero: toca o som antecipado já "adiantado"
            tocarSom(ev.som, volumePreview, -ev.frame / preview.fps);
        } else if (reinicio ? ev.frame === 0 && f >= 0 : passou(ev.frame)) {
            tocarSom(ev.som, volumePreview);
        }
    }
    ultimoFrame = f;
}

async function iniciarSons() {
    const r = await api.listarSons();
    if (r.ok) catalogoSons = r.sons;
    montarMenusSom();
    try { somNoPreview = localStorage.getItem('somNoPreview') !== '0'; } catch (_) { /* sem armazenamento */ }
    $('btnSomPreview').classList.toggle('ligado', somNoPreview);
    $('btnSomPreview').addEventListener('click', () => {
        somNoPreview = !somNoPreview;
        $('btnSomPreview').classList.toggle('ligado', somNoPreview);
        try { localStorage.setItem('somNoPreview', somNoPreview ? '1' : '0'); } catch (_) { /* ok */ }
        if (somNoPreview) { contextoAudio(); preview.recomecar(); ultimoFrame = -1; }
    });
    $('btnOuvirEntrada').addEventListener('click', () => tocarSom(somEscolhido('somEntrada'), Number($('volumeSom').value)));
    $('btnOuvirPalavra').addEventListener('click', () => tocarSom(somEscolhido('somPalavra'), Number($('volumeSom').value)));
    $('btnOuvirSaida').addEventListener('click', () => tocarSom(somEscolhido('somSaida'), Number($('volumeSom').value)));
    $('saida').addEventListener('change', atualizarRotulosSom);
    $('btnPastaSons').addEventListener('click', async () => {
        await api.abrirPastaSons();
        status('Coloque seus .wav/.mp3 na pasta aberta e reabra o plugin para listá-los.', 'ok');
    });
    $('estilo').addEventListener('change', atualizarRotulosSom);
    // o navegador só libera áudio depois de uma interação
    document.addEventListener('pointerdown', () => contextoAudio(), { once: true });
}

// ---- Tela de preview ------------------------------------------------------
//
// O preview desenha a legenda num <canvas> (preview.js) usando o mesmo "spec" de keyframes
// que o main.js manda para o Fusion. Mostra o formulário atual e, ao passar o mouse num
// template, a animação daquele template com o seu texto.

let preview = null;
let infoTL = { fps: 24, largura: 1920, altura: 1080 };
let pedidoPreview = 0;         // descarta respostas antigas (o mouse pode passar rápido)
let cartaoEmFoco = null;
let fundoQuadro = null;        // imagem do quadro da timeline (ou null = fundo padrão)
let esperaFormulario = null;

const TEXTO_EXEMPLO = 'Seu texto aqui';

async function mostrarSpec(params, rotulo, recomecar) {
    const meu = ++pedidoPreview;
    const p = { ...params };
    if (!String(p.texto || '').trim()) p.texto = TEXTO_EXEMPLO;
    const r = await api.gerarSpec(p, infoTL.fps, aspectoPreview());
    if (meu !== pedidoPreview || !r.ok) return;   // chegou outra prévia depois desta
    preview.mostrar(r.spec, r.duracao, infoTL.fps, recomecar);
    definirEventosPreview(r.spec, infoTL.fps);
    if (recomecar) ultimoFrame = -1;
    $('rotuloPreview').innerHTML = '';
    $('rotuloPreview').append('Prévia: ');
    const b = document.createElement('b');
    b.textContent = rotulo;
    $('rotuloPreview').appendChild(b);
}

// Prévia do formulário. Ao arrastar sliders não recomeça a animação (fica fluido).
function mostrarFormulario(recomecar = false) {
    if (cartaoEmFoco) return;
    mostrarSpec(lerParams(), 'formulário', recomecar);
}

function agendarFormulario(recomecar = false) {
    clearTimeout(esperaFormulario);
    esperaFormulario = setTimeout(() => mostrarFormulario(recomecar), 120);
}

function previewTemplate(t, cartao) {
    if (cartaoEmFoco) cartaoEmFoco.classList.remove('tocando');
    cartaoEmFoco = cartao;
    cartao.classList.add('tocando');
    // texto do formulário + visual do template (composições mostram o texto de exemplo delas)
    const { params } = paramsDoTemplate(t);
    const base = lerParams();
    if (!t.camadas) {
        delete base.camadas;
        base.texto = String(base.texto || '').split('\n').filter((l) => l.trim()).join(' ');
    }
    mostrarSpec({ ...base, ...params }, t.nome, true);
}

function sairPreviewTemplate(cartao) {
    cartao.classList.remove('tocando');
    if (cartaoEmFoco !== cartao) return;
    cartaoEmFoco = null;
    mostrarFormulario(true);
}

// Largura/altura da tela de preview (composições posicionam as camadas com ela)
function aspectoPreview() {
    const escolha = $('proporcao').value;
    if (escolha && escolha !== 'timeline') {
        const [w, h] = escolha.split('x').map(Number);
        return w / h;
    }
    return infoTL.largura / infoTL.altura;
}

// Ajusta o canvas à proporção escolhida (ou à da timeline)
function ajustarProporcao() {
    let largura = infoTL.largura;
    let altura = infoTL.altura;
    const escolha = $('proporcao').value;
    if (escolha !== 'timeline') [largura, altura] = escolha.split('x').map(Number);
    const palco = $('palco');
    preview.definirProporcao(largura, altura, Math.max(80, palco.clientWidth), Math.max(80, palco.clientHeight));
    // a camada de edição acompanha o tamanho do canvas
    const tela = $('telaPreview');
    const camada = $('camadaEdicao');
    camada.style.width = tela.style.width;
    camada.style.height = tela.style.height;
    camada.width = tela.width;
    camada.height = tela.height;
    desenharEdicao();
}

async function alternarQuadro() {
    if (fundoQuadro) {
        fundoQuadro = null;
        preview.definirFundo(null);
        $('btnQuadro').classList.remove('ligado');
        return;
    }
    const r = await executar(null, 'Lendo quadro da timeline', api.quadroTimeline);
    if (!r) return;
    const img = new Image();
    img.onload = () => {
        fundoQuadro = img;
        preview.definirFundo(img);
        $('btnQuadro').classList.add('ligado');
        status('Fundo do preview: quadro sob o playhead.', 'ok');
    };
    img.src = 'data:image/jpeg;base64,' + r.imagem;
}

// Lê resolução e fps da timeline atual; se mudou, ajusta o preview
async function atualizarInfoTimeline(forcar) {
    const r = await api.infoTimeline();
    if (!r.ok) return;
    const mudou = r.largura !== infoTL.largura || r.altura !== infoTL.altura || r.fps !== infoTL.fps;
    infoTL = r;
    $('proporcao').options[0].textContent = !r.padrao ? `Timeline (${r.largura}×${r.altura})` : 'Timeline';
    $('formatoTitulos').options[0].textContent = !r.padrao ? `Timeline atual (${r.largura}×${r.altura})` : 'Timeline atual';
    if (mudou || forcar) {
        ajustarProporcao();
        if (!forcar) mostrarFormulario(true);
    }
}

async function iniciarPreview() {
    preview = new window.PreviewLegendas($('telaPreview'), (f, dur) => {
        $('trilhaPos').style.width = Math.min(100, (Math.min(f, dur) / dur) * 100) + '%';
        sonsDoFrame(f);
        desenharEdicao();
    });
    iniciarEdicao();
    await atualizarInfoTimeline(true);
    // Ao voltar para a janela do plugin (você pode ter trocado de timeline no Resolve)
    window.addEventListener('focus', () => atualizarInfoTimeline(false));
    $('proporcao').addEventListener('change', () => { ajustarProporcao(); mostrarFormulario(true); });
    window.addEventListener('resize', ajustarProporcao);
    $('btnReplay').addEventListener('click', () => { preview.recomecar(); ultimoFrame = -1; });
    $('btnQuadro').addEventListener('click', alternarQuadro);

    // Qualquer mudança no formulário atualiza a prévia
    for (const c of CAMPOS) {
        if (c === 'timecode') continue;
        const el = $(c);
        el.addEventListener('input', () => agendarFormulario(false));
        el.addEventListener('change', () => agendarFormulario(['estilo', 'duracao', 'saida', 'duracaoSaida'].includes(c)));
    }
    mostrarFormulario(true);
}

// ---- Fusion Titles (arrastar para a timeline) ------------------------------
//
// Gera um Fusion Title para cada template (prontos + seus), com ícone desenhado pelo próprio
// motor do preview, e instala na Biblioteca de Efeitos do Resolve.

// Desenha uma composição no quadro de repouso e enquadra o resultado num canvas pequeno
async function desenharMiniaturaComposicao(destino, params) {
    // tamanho fixo que sempre cabe no canvas interno (a miniatura é enquadrada depois)
    const r = await api.gerarSpec({ ...params, duracao: 3, tamanho: 0.07, x: 0.5, y: 0.5 }, 24, 16 / 9);
    if (!r.ok) return;
    const fams = [...new Set(r.spec.camadas.map((c) => c.fonte).filter(Boolean))];
    if (document.fonts && document.fonts.load) {
        await Promise.all(fams.map((f) => document.fonts.load(`900 20px "${f}"`).catch(() => {})));
    }
    const W = 960;
    const H = 540;
    const grande = document.createElement('canvas');
    grande.width = W;
    grande.height = H;
    const g = grande.getContext('2d');
    window.PreviewLegendas.desenharFrame(g, W, H, r.spec, window.PreviewLegendas.frameDeRepouso(r.spec, r.duracao));
    // recorte: área com pixels desenhados (inclui brilho e sombra)
    const dados = g.getImageData(0, 0, W, H).data;
    let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
    for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
            if (dados[(y * W + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    const ctx = destino.getContext('2d');
    window.PreviewLegendas.desenharFundo(ctx, destino.width, destino.height, null);
    if (x1 <= x0) return;
    const folga = 0.12;
    const w = x1 - x0;
    const h = y1 - y0;
    const escala = Math.min(destino.width * (1 - folga) / w, destino.height * (1 - folga) / h);
    ctx.drawImage(grande, x0, y0, w, h, (destino.width - w * escala) / 2, (destino.height - h * escala) / 2, w * escala, h * escala);
}

async function iconeTemplate(params) {
    const c = document.createElement('canvas');
    c.width = 208;    // 2x o tamanho recomendado pelo Resolve (104 x 58)
    c.height = 116;
    if (params.camadas) {
        await desenharMiniaturaComposicao(c, params);
        return c.toDataURL('image/png').split(',')[1];
    }
    const r = await api.gerarSpec({ ...params }, infoTL.fps);
    if (!r.ok) return null;
    const ctx = c.getContext('2d');
    window.PreviewLegendas.desenharFundo(ctx, c.width, c.height, null);
    // o ícone é 16:9; o texto fica um pouco maior para ser legível na Biblioteca
    const spec = { ...r.spec, tamanho: Math.max(r.spec.tamanho * 1.6, 0.12), centro: [0.5, 0.5] };
    spec.animacoes = [];
    if (document.fonts && document.fonts.load) {
        try { await document.fonts.load(`700 20px "${spec.fonte}"`, spec.texto); } catch (_) { /* ok */ }
    }
    window.PreviewLegendas.desenharFrame(ctx, c.width, c.height, spec, 0);
    return c.toDataURL('image/png').split(',')[1];
}

async function exportarTitulos() {
    let formato = [infoTL.largura, infoTL.altura];
    const escolha = $('formatoTitulos').value;
    if (escolha !== 'timeline') formato = escolha.split('x').map(Number);
    const titulos = [];
    status('Preparando ícones dos templates...');
    for (const t of templates) {
        const { params } = paramsDoTemplate(t, formato[0] / formato[1]);
        if (!params.fonte) params.fonte = $('fonte').value;
        if (!params.estiloFonte) params.estiloFonte = $('estiloFonte').value;
        if (!params.camadas) params.texto = 'Seu texto aqui';   // composições usam o texto delas
        if (!params.duracao) params.duracao = 3;
        titulos.push({ nome: t.nome, params, icone: await iconeTemplate(params) });
    }
    const r = await executar(null, `Instalando ${titulos.length} títulos (${formato.join('×')})`,
        () => api.exportarTitulos({ titulos, formato }));
    if (!r) return;
    const erro = r.erros.length ? ` ${r.erros.length} com erro: ${r.erros[0]}` : '';
    status(`${r.gerados.length} títulos instalados (${formato.join('×')}, ${r.fps} fps). Arraste de Effects Library › Titles › `
        + `Fusion Titles › DaVinci Textos Virais. Se algum não aparecer, reinicie o DaVinci Resolve.${erro}`, erro ? 'erro' : 'ok');
}

// ---- Edição direta na tela de preview --------------------------------------
//
// Com o mouse sobre a tela, a animação para num quadro "assentado" e aparece uma caixa
// em volta do texto:
//   arrastar dentro da caixa  -> move (Posição X/Y)
//   arrastar um canto         -> aumenta/diminui (Tamanho), a partir do centro do texto
//   roda do mouse             -> aumenta/diminui
//   clicar fora do texto      -> leva o centro do texto até o clique (e continua arrastando)
//   duplo clique              -> centraliza na horizontal
//   teclado (tela em foco)    -> setas movem (Shift = passo maior), + e - mudam o tamanho
// O texto "gruda" no centro horizontal e vertical da tela (linhas vermelhas).

const edicao = { ativo: false, dentro: false, arrasto: null, guiaX: false, guiaY: false, agendado: false };
const IMA_PX = 7;
const ALCA_PX = 8;

function caixaTexto() {
    if (!preview) return null;
    const b = preview.medirTexto();
    if (!b) return null;
    const folga = 6;
    return { x0: b.x0 - folga, y0: b.y0 - folga, x1: b.x1 + folga, y1: b.y1 + folga, cx: b.cx, cy: b.cy };
}

function alcas(b) {
    return [['nwse', b.x0, b.y0], ['nesw', b.x1, b.y0], ['nesw', b.x0, b.y1], ['nwse', b.x1, b.y1]];
}

function oQueEstaEm(px, py) {
    const b = caixaTexto();
    if (!b) return { tipo: 'fora' };
    for (const [cursor, x, y] of alcas(b)) {
        if (Math.abs(px - x) <= ALCA_PX && Math.abs(py - y) <= ALCA_PX) return { tipo: 'alca', cursor, b };
    }
    if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) return { tipo: 'dentro', b };
    return { tipo: 'fora', b };
}

function desenharEdicao() {
    const c = $('camadaEdicao');
    if (!c || !c.width) return;
    const ctx = c.getContext('2d');
    const w = parseFloat(c.style.width) || c.width;
    const h = parseFloat(c.style.height) || c.height;
    const dpr = c.width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!edicao.ativo || cartaoEmFoco) return;
    const b = caixaTexto();
    if (!b) return;

    // linhas do ímã
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(230, 75, 60, .95)';
    ctx.setLineDash([4, 4]);
    if (edicao.guiaX) { ctx.beginPath(); ctx.moveTo(Math.round(w / 2) + 0.5, 0); ctx.lineTo(Math.round(w / 2) + 0.5, h); ctx.stroke(); }
    if (edicao.guiaY) { ctx.beginPath(); ctx.moveTo(0, Math.round(h / 2) + 0.5); ctx.lineTo(w, Math.round(h / 2) + 0.5); ctx.stroke(); }

    // caixa de seleção (traço duplo para aparecer em qualquer fundo)
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = 'rgba(0, 0, 0, .6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0);
    ctx.strokeStyle = 'rgba(255, 255, 255, .95)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0);
    ctx.setLineDash([]);

    // alças nos cantos e cruz no centro
    for (const [, x, y] of alcas(b)) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.strokeStyle = '#e64b3c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 4, y - 4, 8, 8);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.cx - 5, b.cy); ctx.lineTo(b.cx + 5, b.cy);
    ctx.moveTo(b.cx, b.cy - 5); ctx.lineTo(b.cx, b.cy + 5);
    ctx.stroke();

    // valores durante o arrasto
    if (edicao.arrasto) {
        const txt = edicao.arrasto.tipo === 'tamanho'
            ? `Tamanho ${Number($('tamanho').value).toFixed(3)}`
            : `X ${Number($('x').value).toFixed(3)}  Y ${Number($('y').value).toFixed(3)}`;
        ctx.font = '11px -apple-system, sans-serif';
        const lw = ctx.measureText(txt).width + 10;
        const tx = Math.min(Math.max(2, b.cx - lw / 2), w - lw - 2);
        const ty = Math.max(2, b.y0 - 22);
        ctx.fillStyle = 'rgba(20,20,22,.85)';
        ctx.fillRect(tx, ty, lw, 17);
        ctx.fillStyle = '#fff';
        ctx.fillText(txt, tx + 5, ty + 12);
    }
}

function entrarEdicao() {
    if (edicao.ativo || cartaoEmFoco || !preview) return;
    edicao.ativo = true;
    preview.congelar(preview.frameDeRepouso());
    desenharEdicao();
}

function sairEdicao() {
    if (!edicao.ativo || edicao.arrasto) return;
    edicao.ativo = false;
    edicao.guiaX = edicao.guiaY = false;
    $('camadaEdicao').style.cursor = 'default';
    preview.descongelar();
    ultimoFrame = -1;
    desenharEdicao();
}

// Atualiza um campo do formulário e a prévia (no máximo uma vez por quadro de tela)
function definirCampos(valores) {
    for (const [id, v] of Object.entries(valores)) $(id).value = v;
    atualizarSaidas();
    if (!edicao.agendado) {
        edicao.agendado = true;
        setTimeout(() => {
            edicao.agendado = false;
            mostrarSpec(lerParams(), 'formulário', false);
        }, 16);
    }
}

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const arred = (v) => Math.round(v * 1000) / 1000;

function moverPara(x, y, usarIma = true) {
    const c = $('camadaEdicao');
    const w = parseFloat(c.style.width);
    const h = parseFloat(c.style.height);
    edicao.guiaX = usarIma && Math.abs(x - 0.5) * w < IMA_PX;
    edicao.guiaY = usarIma && Math.abs(y - 0.5) * h < IMA_PX;
    if (edicao.guiaX) x = 0.5;
    if (edicao.guiaY) y = 0.5;
    definirCampos({ x: arred(limitar(x, 0, 1)), y: arred(limitar(y, 0, 1)) });
}

function redimensionar(tamanho) {
    definirCampos({ tamanho: arred(limitar(tamanho, 0.01, 0.5)) });
}

function iniciarEdicao() {
    const c = $('camadaEdicao');
    const tela = $('tela');
    const pos = (ev) => {
        const r = c.getBoundingClientRect();
        return [ev.clientX - r.left, ev.clientY - r.top, r.width, r.height];
    };

    c.addEventListener('pointerenter', () => { edicao.dentro = true; entrarEdicao(); });
    c.addEventListener('pointerleave', () => { edicao.dentro = false; if (document.activeElement !== tela) sairEdicao(); });

    c.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        entrarEdicao();
        tela.focus({ preventScroll: true });
        c.setPointerCapture(ev.pointerId);
        const [px, py, w, h] = pos(ev);
        const alvo = oQueEstaEm(px, py);
        if (alvo.tipo === 'alca') {
            edicao.arrasto = {
                tipo: 'tamanho', tamanho: Number($('tamanho').value),
                dist: Math.max(4, Math.hypot(px - alvo.b.cx, py - alvo.b.cy)), cx: alvo.b.cx, cy: alvo.b.cy,
            };
        } else {
            if (alvo.tipo === 'fora') moverPara(px / w, 1 - py / h);   // leva o texto até o clique
            edicao.arrasto = { tipo: 'mover', px, py, x: Number($('x').value), y: Number($('y').value) };
        }
        desenharEdicao();
    });

    c.addEventListener('pointermove', (ev) => {
        const [px, py, w, h] = pos(ev);
        const a = edicao.arrasto;
        if (!a) {
            const alvo = oQueEstaEm(px, py);
            c.style.cursor = alvo.tipo === 'alca' ? `${alvo.cursor}-resize` : alvo.tipo === 'dentro' ? 'move' : 'crosshair';
            return;
        }
        if (a.tipo === 'mover') {
            moverPara(a.x + (px - a.px) / w, a.y - (py - a.py) / h, !ev.altKey);
        } else {
            redimensionar(a.tamanho * Math.hypot(px - a.cx, py - a.cy) / a.dist);
        }
    });

    const soltar = (ev) => {
        if (!edicao.arrasto) return;
        edicao.arrasto = null;
        edicao.guiaX = edicao.guiaY = false;
        try { c.releasePointerCapture(ev.pointerId); } catch (_) { /* ok */ }
        agendarFormulario(false);
        desenharEdicao();
        if (!edicao.dentro && document.activeElement !== tela) sairEdicao();
    };
    c.addEventListener('pointerup', soltar);
    c.addEventListener('pointercancel', soltar);

    c.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        entrarEdicao();
        redimensionar(Number($('tamanho').value) * Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });

    c.addEventListener('dblclick', () => moverPara(0.5, Number($('y').value), false));

    tela.addEventListener('focus', entrarEdicao);
    tela.addEventListener('blur', () => { if (!edicao.dentro) sairEdicao(); });
    tela.addEventListener('keydown', (ev) => {
        const passo = ev.shiftKey ? 0.02 : 0.005;
        const x = Number($('x').value);
        const y = Number($('y').value);
        const t = Number($('tamanho').value);
        const acoes = {
            ArrowLeft: () => moverPara(x - passo, y, false),
            ArrowRight: () => moverPara(x + passo, y, false),
            ArrowUp: () => moverPara(x, y + passo, false),
            ArrowDown: () => moverPara(x, y - passo, false),
            '+': () => redimensionar(t * 1.04),
            '=': () => redimensionar(t * 1.04),
            '-': () => redimensionar(t / 1.04),
        };
        if (acoes[ev.key]) {
            ev.preventDefault();
            acoes[ev.key]();
        }
    });
}

// ---- Abas e janela fixa ----------------------------------------------------

function abrirAba(nome) {
    for (const b of document.querySelectorAll('.aba')) {
        const ativa = b.dataset.aba === nome;
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-selected', ativa ? 'true' : 'false');
    }
    for (const p of document.querySelectorAll('.painel-aba')) p.hidden = p.id !== 'aba-' + nome;
    try { localStorage.setItem('abaAtiva', nome); } catch (_) { /* ok */ }
}

async function fixarJanela(fixar) {
    const r = await api.fixarJanela(fixar);
    const ligado = !!(r && r.ok && r.fixada);
    $('btnFixar').setAttribute('aria-pressed', ligado ? 'true' : 'false');
    $('btnFixar').innerHTML = ligado ? '&#x1F4CC; Fixada' : '&#x1F4CC; Fixar';
    try { localStorage.setItem('janelaFixa', ligado ? '1' : '0'); } catch (_) { /* ok */ }
    return ligado;
}

function iniciarAbasEJanela() {
    for (const b of document.querySelectorAll('.aba')) b.addEventListener('click', () => abrirAba(b.dataset.aba));
    let aba = 'templates';
    try { aba = localStorage.getItem('abaAtiva') || aba; } catch (_) { /* ok */ }
    abrirAba(document.getElementById('aba-' + aba) ? aba : 'templates');

    $('btnFixar').addEventListener('click', async () => {
        const ligado = await fixarJanela($('btnFixar').getAttribute('aria-pressed') !== 'true');
        status(ligado ? 'Janela fixada por cima do DaVinci Resolve.' : 'Janela solta (volta a ficar atrás do Resolve ao clicar nele).', 'ok');
    });
    let fixa = false;
    try { fixa = localStorage.getItem('janelaFixa') === '1'; } catch (_) { /* ok */ }
    if (fixa) fixarJanela(true);
}

// ---- Inicialização -------------------------------------------------------

async function iniciar() {
    iniciarAbasEJanela();
    // Pede a lista de fontes já no começo (o Python leva ~1-2 s) e segue montando a tela
    const pedidoFontes = api.listarFontes().catch((e) => ({ ok: false, erro: e.message }));
    iniciarSeletorFonte();
    try { $('manterFonte').checked = localStorage.getItem('manterFonte') === '1'; } catch (_) { /* ok */ }
    $('manterFonte').addEventListener('change', () => {
        try { localStorage.setItem('manterFonte', $('manterFonte').checked ? '1' : '0'); } catch (_) { /* ok */ }
        desenharTemplates();
    });
    // Estilos de animação (definidos em estilos.js)
    const r = await api.listarEstilos();
    if (r.ok) {
        for (const e of r.estilos) {
            $('estilo').add(new Option(e.nome, e.id));
            estilosInfo[e.id] = e;
        }
        $('saida').add(new Option('Automático', 'auto'));
        for (const s of r.saidas || []) {
            $('saida').add(new Option(s.nome, s.id));
            saidasInfo[s.id] = s;
        }
    }
    await iniciarSons();

    for (const el of document.querySelectorAll('input[type=range]')) el.addEventListener('input', atualizarSaidas);
    for (const id of ['contorno', 'sombra', 'brilho', 'fundo', 'sons', 'brilhoCorTexto']) $(id).addEventListener('change', atualizarSaidas);
    $('brilhoCorTexto').addEventListener('change', () => agendarFormulario(false));
    atualizarSaidas();

    // Tela de preview
    await iniciarPreview();

    // Templates
    const rt = await api.listarTemplates();
    if (rt.ok) { templates = rt.templates; desenharTemplates(); }
    $('btnSalvarTemplate').addEventListener('click', salvarTemplate);
    $('btnExportarTitulos').addEventListener('click', exportarTitulos);
    $('texto').addEventListener('input', () => {
        if (!composicaoAtiva) return;
        const linhas = $('texto').value.split('\n');
        $('painelCamadas').querySelectorAll('.camada-texto').forEach((el, i) => { el.textContent = (linhas[i] || '').slice(0, 28); });
    });
    $('btnSairComposicao').addEventListener('click', () => {
        definirComposicao(null);
        $('texto').value = $('texto').value.split('\n').filter((l) => l.trim()).join(' ');
        mostrarFormulario(true);
    });
    $('btnPastaTitulos').addEventListener('click', () => api.abrirPastaTitulos());
    $('nomeTemplate').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') salvarTemplate(); });

    $('fonte').addEventListener('change', () => { if ($('manterFonte').checked) desenharTemplates(); });
    $('estiloFonte').addEventListener('change', () => { if ($('manterFonte').checked) desenharTemplates(); });

    $('btnPlayhead').addEventListener('click', async () => {
        const r = await executar(null, 'Lendo playhead', api.obterPlayhead);
        if (r) { $('timecode').value = r.timecode; status('Playhead: ' + r.timecode, 'ok'); }
    });

    $('btnAplicar').addEventListener('click', async () => {
        const p = lerParams();
        if (!p.texto.trim()) return status('Digite um texto.', 'erro');
        relatar(await executar(null, 'Inserindo texto', () => api.inserirTexto(p)), 'inserido(s)');
        atualizarInfoTimeline(false);
    });

    $('btnAtualizar').addEventListener('click', async () => {
        relatar(await executar(null, 'Atualizando selecionado', () => api.atualizarSelecionado(lerParams())), 'atualizado(s)');
    });

    $('btnCarregar').addEventListener('click', async () => {
        const r = await executar(null, 'Lendo texto selecionado', api.carregarSelecionado);
        if (r) {
            definirComposicao(r.params.camadas ? { nome: r.params.composicaoNome, camadas: r.params.camadas } : null);
            preencher(r.params);
            mostrarFormulario(true);
            status('Dados carregados do texto selecionado.', 'ok');
        }
    });

    // ---- Transcrição ----
    document.querySelectorAll('input[name=origem]').forEach((el) => el.addEventListener('change', () => {
        $('origemArquivo').hidden = document.querySelector('input[name=origem]:checked').value !== 'arquivo';
    }));

    $('btnArquivo').addEventListener('click', async () => {
        const r = await api.escolherArquivo();
        if (r.ok && r.arquivo) $('arquivo').value = r.arquivo;
    });

    api.aoProgresso(({ pct, msg }) => {
        $('progresso').hidden = false;
        $('progresso').value = pct;
        status(`Transcrição ${pct}% — ${msg}`);
    });
    api.aoLog((msg) => console.log('%cMAIN:', 'color:#e64b3c', msg));

    $('btnTranscrever').addEventListener('click', async () => {
        const porArquivo = document.querySelector('input[name=origem]:checked').value === 'arquivo';
        if (porArquivo && !$('arquivo').value) return status('Escolha um arquivo de áudio/vídeo.', 'erro');
        const estilo = lerParams();
        delete estilo.texto;
        delete estilo.timecode;
        const opcoes = {
            arquivo: porArquivo ? $('arquivo').value : null,
            timecodeInicio: $('tcInicio').value.trim() || null,
            modo: $('modo').value,
            maxPalavras: parseInt($('maxPalavras').value, 10),
            modelo: $('modelo').value,
            idioma: $('idioma').value,
            estilo,
        };
        $('progresso').value = 0;
        const r = await executar(null, 'Transcrevendo (a primeira vez baixa o modelo)', () => api.transcrever(opcoes));
        $('progresso').hidden = true;
        relatar(r, 'inserido(s) a partir da transcrição');
    });

    // Fontes instaladas: o pedido foi feito no início de iniciar(); aqui só esperamos
    const f = await pedidoFontes;
    if (f.ok) {
        fontes = f.fontes;
        fontesCarregadas = true;
        atualizarPesos();
        desenharTemplates(); // agora já sabemos quais fontes estão instaladas
        if (composicaoAtiva) {
            composicaoAtiva.camadas = composicaoAtiva.camadas.map((c) => (c.segue !== undefined || !c.fonte ? c
                : { ...c, estiloFonte: estiloMaisProximo(c.fonte, c.estiloFonte || 'Bold') }));
            desenharPainelCamadas();
        }
        if (!$('painelFontes').hidden) desenharListaFontes();
        mostrarFormulario(false);
        status(`Pronto. ${Object.keys(fontes).length} fontes disponíveis.`);
    } else {
        erroFontes = f.erro;
        if (!$('painelFontes').hidden) desenharListaFontes();
        status('Não foi possível ler as fontes do DaVinci: ' + f.erro, 'erro');
    }
}

iniciar();
