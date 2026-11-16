// =============================================================================
// DaVinci Textos Virais - processo principal (Electron) do plugin Workflow Integration
// =============================================================================
//
// Divisão de trabalho:
//   * main.js (aqui)   -> fala com o Resolve pela API JavaScript (WorkflowIntegration.node):
//                         timeline, playhead, inserção da composição Fusion, seleção.
//   * estilos.js       -> define os estilos de animação (fácil de expandir).
//   * python/legendas_fusion.py -> monta o Text+ e os keyframes DENTRO da composição
//                         Fusion. A API JavaScript não dá acesso aos nós do Fusion,
//                         então chamamos este script pelo child_process.
//   * python/transcrever.py -> transcrição com faster-whisper (ambiente virtual próprio).
//
// O renderer (interface) só conversa com este arquivo pelos canais IPC expostos no preload.js.
// =============================================================================

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const WorkflowIntegration = require('./WorkflowIntegration.node');
const { montarSpec, listarEstilos, listarSaidas, camadaPrincipal } = require('./estilos.js');
const { listarTemplates } = require('./templates.js');

const PLUGIN_ID = 'com.netto.editordelegendas';

// ---- Caminhos ---------------------------------------------------------------

const PASTA_PYTHON = path.join(__dirname, 'python');
const SCRIPT_FUSION = path.join(PASTA_PYTHON, 'legendas_fusion.py');
const SCRIPT_TRANSCRICAO = path.join(PASTA_PYTHON, 'transcrever.py');

// Python embutido do Resolve (21.1+): já sabe "import DaVinciResolveScript"
const RESOLVE_PYTHON = process.platform === 'win32'
    ? 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\ResolvePython\\ResolvePython.exe'
    : '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Applications/ResolvePython';

// Ambiente virtual com o faster-whisper (criado por instalar_whisper.sh)
const PASTA_DADOS = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'EditorDeLegendas')
    : path.join(os.homedir(), 'Library', 'Application Support', 'EditorDeLegendas');
const WHISPER_PYTHON = process.platform === 'win32'
    ? path.join(PASTA_DADOS, 'venv', 'Scripts', 'python.exe')
    : path.join(PASTA_DADOS, 'venv', 'bin', 'python');

let mainWindow = null;
let resolveObj = null;

// ---- Log no console da janela do plugin (abra o DevTools para ver) ----------

function debugLog(...partes) {
    const msg = partes.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    console.log('[DaVinci Textos Virais]', msg);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', msg);
    }
}

// =============================================================================
// Conexão com o Resolve (API JavaScript)
// =============================================================================

async function getResolve() {
    if (resolveObj) return resolveObj;
    const ok = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!ok) throw new Error('Falha ao inicializar a interface com o Resolve (WorkflowIntegration.Initialize).');
    resolveObj = await WorkflowIntegration.GetResolve();
    if (!resolveObj) throw new Error('Falha ao obter o objeto Resolve (GetResolve).');
    return resolveObj;
}

async function getTimeline() {
    const resolve = await getResolve();
    const projeto = await (await resolve.GetProjectManager()).GetCurrentProject();
    if (!projeto) throw new Error('Nenhum projeto aberto no Resolve.');
    const timeline = await projeto.GetCurrentTimeline();
    if (!timeline) throw new Error('Abra uma timeline antes de usar o plugin.');
    return timeline;
}

// largura/altura da timeline (composições posicionam as camadas com a proporção do quadro)
async function aspectoDe(timeline) {
    try {
        const w = parseFloat(await timeline.GetSetting('timelineResolutionWidth'));
        const h = parseFloat(await timeline.GetSetting('timelineResolutionHeight'));
        if (w > 0 && h > 0) return w / h;
    } catch (_) { /* usa o padrão */ }
    return 16 / 9;
}

// fps, fps inteiro (base do timecode) e se é drop frame
async function infoFps(timeline) {
    const fps = parseFloat(await timeline.GetSetting('timelineFrameRate')) || 24;
    const df = String(await timeline.GetSetting('timelineDropFrameTimecode')) === '1';
    return { fps, base: Math.round(fps), df };
}

// ---- Timecode <-> frames (mesma lógica do script Python) -------------------

function framesParaTC(frame, { base, df }) {
    let f = Math.round(frame);
    if (df && (base === 30 || base === 60)) {
        const drop = base === 30 ? 2 : 4;
        const por10 = base * 600 - drop * 9;
        const porMin = base * 60 - drop;
        const d = Math.floor(f / por10);
        const m = f % por10;
        f += m > drop ? drop * 9 * d + drop * Math.floor((m - drop) / porMin) : drop * 9 * d;
    }
    const h = Math.floor(f / (base * 3600)); f -= h * base * 3600;
    const mi = Math.floor(f / (base * 60)); f -= mi * base * 60;
    const s = Math.floor(f / base); f -= s * base;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(h % 24)}:${p(mi)}:${p(s)}${df ? ';' : ':'}${p(f)}`;
}

function tcParaFrames(tc, { base, df }) {
    const partes = String(tc).trim().split(/[:;.]/).map((n) => parseInt(n, 10));
    if (partes.length !== 4 || partes.some(isNaN)) throw new Error(`Timecode inválido: "${tc}" (use HH:MM:SS:FF).`);
    const [h, m, s, f] = partes;
    let total = ((h * 60 + m) * 60 + s) * base + f;
    if (df && (base === 30 || base === 60)) {
        const drop = base === 30 ? 2 : 4;
        const minutos = h * 60 + m;
        total -= drop * (minutos - Math.floor(minutos / 10));
    }
    return total;
}

// =============================================================================
// Ponte com o Python
// =============================================================================

// Executa python/legendas_fusion.py <comando> <json> e devolve o JSON da resposta.
function rodarFusion(comando, dados = null) {
    return new Promise((resolve, reject) => {
        const args = [SCRIPT_FUSION, comando];
        let arquivoTemp = null;
        if (dados) {
            arquivoTemp = path.join(os.tmpdir(), `editor-legendas-${process.pid}-${Date.now()}.json`);
            fs.writeFileSync(arquivoTemp, JSON.stringify(dados), 'utf-8');
            args.push(arquivoTemp);
        }
        const python = fs.existsSync(RESOLVE_PYTHON) ? RESOLVE_PYTHON : 'python3';
        execFile(python, args, { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (erro, stdout, stderr) => {
            if (arquivoTemp) fs.rm(arquivoTemp, { force: true }, () => {});
            if (stderr && stderr.trim()) debugLog('python:', stderr.trim());
            let resposta;
            try {
                resposta = JSON.parse(stdout);
            } catch (e) {
                return reject(new Error(`Resposta inválida do Python: ${erro ? erro.message : stdout.slice(0, 300)}`));
            }
            if (!resposta.ok) return reject(new Error(resposta.erro || 'Erro no script Python.'));
            resolve(resposta);
        });
    });
}

// =============================================================================
// Inserção da composição Fusion pela API JavaScript
// =============================================================================
//
// IMPORTANTE: InsertFusionCompositionIntoTimeline() faz um insert COM RIPPLE no playhead.
// Se inseríssemos direto no timecode desejado, ele cortaria o clipe do V1 e empurraria o
// resto da edição. Por isso: playhead no FIM da timeline -> insere -> apara a duração.
// O script Python depois move o clipe para o timecode/faixa certos (SetPosition) e monta
// o Text+ dentro dele.
//
// Retorna o UniqueId do clipe inserido, ou null se a API JS falhar (aí o Python insere).
async function inserirComposicaoJS(timeline, fpsInfo, duracao) {
    try {
        const fim = await timeline.GetEndFrame();
        await timeline.SetCurrentTimecode(framesParaTC(fim, fpsInfo));
        const item = await timeline.InsertFusionCompositionIntoTimeline();
        if (!item) return null;
        const durInicial = Math.round(await item.GetDuration());
        if (duracao < durInicial) {
            await item.SetRightOffset(durInicial - duracao); // encurta pelo lado direito
        }
        return await item.GetUniqueId();
    } catch (e) {
        debugLog('Inserção via JavaScript falhou, o Python vai inserir:', e.message);
        return null;
    }
}

// Insere uma lista de jobs {frame, duracao, spec} e configura tudo pelo Python.
async function inserirJobs(jobs) {
    const timeline = await getTimeline();
    const fpsInfo = await infoFps(timeline);
    const playheadOriginal = await timeline.GetCurrentTimecode();

    for (const job of jobs) {
        job.uid = await inserirComposicaoJS(timeline, fpsInfo, job.duracao);
    }
    const resposta = await rodarFusion('aplicar', { jobs });

    // Deixa o playhead no primeiro texto inserido (ou onde estava)
    const primeiro = resposta.resultados.find((r) => r.ok);
    try {
        await timeline.SetCurrentTimecode(primeiro ? framesParaTC(primeiro.inicio, fpsInfo) : playheadOriginal);
    } catch (_) { /* sem problema */ }
    return resposta;
}

function resumir(resposta) {
    const ok = resposta.resultados.filter((r) => r.ok).length;
    const erros = resposta.resultados.filter((r) => !r.ok).map((r) => r.erro);
    return { ok: true, inseridos: ok, erros, avisos: resposta.avisos || [], resultados: resposta.resultados };
}

// =============================================================================
// Handlers IPC
// =============================================================================

// "inserir-texto": cria um texto animado no timecode informado
async function inserirTexto(_evento, params) {
    const timeline = await getTimeline();
    const fpsInfo = await infoFps(timeline);
    const tc = params.timecode && params.timecode.trim() ? params.timecode : await timeline.GetCurrentTimecode();
    const frame = tcParaFrames(tc, fpsInfo);
    const duracao = Math.max(1, Math.round((Number(params.duracao) || 3) * fpsInfo.fps));
    const spec = specComSons(params, duracao, fpsInfo.fps, null, { aspecto: await aspectoDe(timeline) });
    debugLog(`Inserindo "${params.texto}" em ${tc} (${duracao} frames, estilo ${params.estilo})`);
    return resumir(await inserirJobs([{ frame, duracao, spec }]));
}

// "atualizar-selecionado": reaplica texto/estilo nos clipes selecionados na timeline.
//  - 1 clipe selecionado: usa o texto do formulário.
//  - vários clipes: mantém o texto de cada um e aplica só o visual (estilo, fonte, cor...).
async function atualizarSelecionado(_evento, params) {
    const timeline = await getTimeline();
    const { fps } = await infoFps(timeline);
    const aspecto = await aspectoDe(timeline);
    const { itens } = await rodarFusion('selecionados');
    if (!itens.length) throw new Error('Selecione na timeline o(s) texto(s) a atualizar.');

    const varios = itens.length > 1;
    const jobs = itens.map((item) => {
        const salvos = item.dados || {};
        const p = { ...params };
        if (varios && salvos.texto) p.texto = salvos.texto;
        // Tempos reais das palavras (da transcrição) só valem se o texto não mudou
        if (salvos.tempos && p.texto === salvos.texto) p.tempos = salvos.tempos;
        return {
            uid: item.uid,
            frame: item.inicio,
            duracao: Math.round(item.duracao),
            spec: specComSons(p, Math.round(item.duracao), fps, p.tempos, { aspecto }),
        };
    });
    debugLog(`Atualizando ${jobs.length} clipe(s)`);
    return resumir(await rodarFusion('aplicar', { jobs, manterPosicao: true }));
}

// "carregar-selecionado": devolve os parâmetros salvos no clipe selecionado
async function carregarSelecionado() {
    const { itens } = await rodarFusion('selecionados');
    const comDados = itens.find((i) => i.dados);
    if (!comDados) throw new Error('Nenhum texto do DaVinci Textos Virais selecionado na timeline.');
    const timeline = await getTimeline();
    const fpsInfo = await infoFps(timeline);
    return {
        ...comDados.dados,
        timecode: framesParaTC(comDados.inicio, fpsInfo),
        duracao: +(comDados.duracao / fpsInfo.fps).toFixed(2),
    };
}

async function obterPlayhead() {
    const timeline = await getTimeline();
    return timeline.GetCurrentTimecode();
}

let cacheFontes = null;
async function listarFontes() {
    if (!cacheFontes) cacheFontes = (await rodarFusion('fontes')).fontes;
    return cacheFontes;
}

async function escolherArquivo() {
    const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Escolha o áudio ou vídeo para transcrever',
        properties: ['openFile'],
        filters: [{ name: 'Áudio/Vídeo', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'aiff', 'mov', 'mp4', 'mkv', 'mxf'] }],
    });
    return r.canceled ? null : r.filePaths[0];
}

// =============================================================================
// Transcrição automática (faster-whisper)
// =============================================================================

function rodarWhisper(args) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(WHISPER_PYTHON)) {
            return reject(new Error('faster-whisper não instalado. Rode o instalar_whisper.sh que está na pasta do plugin.'));
        }
        const proc = spawn(WHISPER_PYTHON, ['-I', SCRIPT_TRANSCRICAO, ...args]);
        let saida = '';
        let resto = '';
        proc.stdout.on('data', (d) => { saida += d.toString(); });
        proc.stderr.on('data', (d) => {
            resto += d.toString();
            const linhas = resto.split('\n');
            resto = linhas.pop();
            for (const linha of linhas) {
                const m = linha.match(/^PROGRESSO (\d+) (.*)$/);
                if (m && mainWindow) mainWindow.webContents.send('progresso', { pct: +m[1], msg: m[2] });
                else if (linha.trim()) debugLog('whisper:', linha);
            }
        });
        proc.on('error', reject);
        proc.on('close', () => {
            try {
                const r = JSON.parse(saida);
                if (!r.ok) return reject(new Error(r.erro));
                resolve(r);
            } catch (e) {
                reject(new Error('A transcrição terminou sem resultado. Veja o console (DevTools).'));
            }
        });
    });
}

// Agrupa as palavras em blocos de legenda.
//   modo "palavra": um texto por palavra
//   modo "frase":   até N palavras, quebrando em pontuação ou pausa
//   modo "segmento": os segmentos originais do Whisper
function agrupar(transcricao, modo, maxPalavras) {
    const { palavras, segmentos } = transcricao;
    if (modo === 'palavra') return palavras.map((p) => [p]);
    if (modo === 'segmento') return segmentos.map((s) => s.palavras.map((i) => palavras[i]));

    const grupos = [];
    let atual = [];
    palavras.forEach((p, i) => {
        const anterior = palavras[i - 1];
        const pausa = anterior ? p.inicio - anterior.fim : 0;
        if (atual.length && (atual.length >= maxPalavras || pausa > 0.6)) {
            grupos.push(atual);
            atual = [];
        }
        atual.push(p);
        if (/[.!?…]$/.test(p.texto) || (/[,;:]$/.test(p.texto) && atual.length >= 2)) {
            grupos.push(atual);
            atual = [];
        }
    });
    if (atual.length) grupos.push(atual);
    return grupos;
}

async function transcrever(_evento, opcoes) {
    const timeline = await getTimeline();
    const fpsInfo = await infoFps(timeline);
    const { fps } = fpsInfo;

    // 1. De onde vem o áudio e onde ele está na timeline
    let fonte;
    if (opcoes.arquivo) {
        fonte = {
            arquivo: opcoes.arquivo,
            inicioTimeline: tcParaFrames(opcoes.timecodeInicio || framesParaTC(await timeline.GetStartFrame(), fpsInfo), fpsInfo),
            fonteInicio: 0,
            fonteFim: null,
        };
    } else {
        fonte = await rodarFusion('info-clipe'); // clipe selecionado ou sob o playhead
    }
    debugLog('Transcrevendo:', fonte.arquivo);

    // 2. Whisper
    const args = ['--arquivo', fonte.arquivo, '--modelo', opcoes.modelo || 'small', '--idioma', opcoes.idioma || 'pt'];
    if (!opcoes.arquivo) args.push('--inicio', String(fonte.fonteInicio), '--fim', String(fonte.fonteFim));
    const transcricao = await rodarWhisper(args);
    if (!transcricao.palavras.length) throw new Error('Nenhuma fala encontrada.');

    // 3. Converte para frames da timeline e monta um job por bloco
    const paraFrame = (seg) => fonte.inicioTimeline + Math.round((seg - fonte.fonteInicio) * fps);
    const grupos = agrupar(transcricao, opcoes.modo, Math.max(1, Number(opcoes.maxPalavras) || 4));
    const jobs = [];
    grupos.forEach((grupo, i) => {
        const inicio = paraFrame(grupo[0].inicio);
        const proximo = grupos[i + 1] ? paraFrame(grupos[i + 1][0].inicio) : Infinity;
        // fica na tela até a próxima legenda se a pausa for curta (< 1 s); senão some
        // 0,5 s depois da última palavra
        const fimFala = paraFrame(grupo[grupo.length - 1].fim);
        let fim = proximo - fimFala < fps ? proximo : Math.min(proximo, fimFala + Math.round(fps * 0.5));
        fim = Math.max(fim, Math.min(proximo, inicio + Math.round(fps * 0.3)));
        const duracao = Math.max(1, fim - inicio);
        const texto = grupo.map((p) => p.texto).join(' ');
        const tempos = grupo.map((p) => ({
            ini: Math.max(0, Math.round((p.inicio - grupo[0].inicio) * fps)),
            fim: Math.round((p.fim - grupo[0].inicio) * fps),
        }));
        // composição (várias camadas) vira legenda simples com o visual da camada principal
        const params = { ...camadaPrincipal(opcoes.estilo), texto, tempos };
        jobs.push({ frame: inicio, duracao, spec: specComSons(params, duracao, fps, tempos) });
    });

    if (mainWindow) mainWindow.webContents.send('progresso', { pct: 100, msg: `Inserindo ${jobs.length} textos na timeline...` });
    debugLog(`Inserindo ${jobs.length} textos`);
    return resumir(await inserirJobs(jobs));
}

// =============================================================================
// Templates
// =============================================================================
//
// Os templates prontos vêm de templates.js. Os salvos pelo usuário ficam num JSON fora da
// pasta do plugin (que pertence ao root e é substituída a cada reinstalação).

const ARQUIVO_TEMPLATES = path.join(PASTA_DADOS, 'templates.json');

// Campos do formulário que um template guarda (nunca o texto nem o timecode)
const CAMPOS_TEMPLATE = ['estilo', 'fonte', 'estiloFonte', 'cor', 'corDestaque', 'corFundo', 'tamanho', 'x', 'y',
    'contorno', 'sombra', 'brilho', 'fundo', 'maiusculas', 'opacidadeFundo', 'duracao', 'modo', 'maxPalavras',
    'sons', 'somEntrada', 'somPalavra', 'somSaida', 'volumeSom', 'saida', 'duracaoSaida',
    'corContorno', 'espessuraContorno', 'corSombra', 'opacidadeSombra', 'suavidadeSombra', 'sombraX', 'sombraY',
    'corBrilho', 'intensidadeBrilho', 'tamanhoBrilho', 'margemFundoX', 'margemFundoY', 'arredondarFundo',
    'camadas', 'composicaoNome', 'texto'];

function lerTemplatesUsuario() {
    try {
        const dados = JSON.parse(fs.readFileSync(ARQUIVO_TEMPLATES, 'utf-8'));
        return Array.isArray(dados) ? dados : [];
    } catch (_) {
        return []; // arquivo ainda não existe
    }
}

function gravarTemplatesUsuario(lista) {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    fs.writeFileSync(ARQUIVO_TEMPLATES, JSON.stringify(lista, null, 2), 'utf-8');
}

function todosTemplates() {
    return [...listarTemplates(), ...lerTemplatesUsuario().map((t) => ({ ...t, embutido: false }))];
}

// Salva (ou substitui, se o nome já existir) um template do usuário
function salvarTemplate(_evento, nome, params) {
    nome = String(nome || '').trim();
    if (!nome) throw new Error('Dê um nome ao template.');
    const template = { id: 'usuario-' + Date.now(), nome };
    for (const c of CAMPOS_TEMPLATE) if (params[c] !== undefined) template[c] = params[c];
    const lista = lerTemplatesUsuario();
    const i = lista.findIndex((t) => t.nome.toLowerCase() === nome.toLowerCase());
    if (i >= 0) {
        template.id = lista[i].id;
        lista[i] = template;
    } else {
        lista.push(template);
    }
    gravarTemplatesUsuario(lista);
    debugLog(`Template salvo: ${nome}`);
    return { ok: true, templates: todosTemplates(), id: template.id };
}

function excluirTemplate(_evento, id) {
    gravarTemplatesUsuario(lerTemplatesUsuario().filter((t) => t.id !== id));
    return { ok: true, templates: todosTemplates() };
}

// =============================================================================
// Efeitos sonoros
// =============================================================================
//
// Sons prontos: pasta sons/ do plugin (gerados por python/gerar_sons.py, catálogo em sons.json).
// Sons do usuário: qualquer .wav/.mp3/.aif/.m4a colocado em
//   ~/Library/Application Support/EditorDeLegendas/sons   (id "meu:<arquivo>")

const PASTA_SONS = path.join(__dirname, 'sons');
const PASTA_SONS_USUARIO = path.join(PASTA_DADOS, 'sons');
const EXTENSOES_SOM = ['.wav', '.mp3', '.aif', '.aiff', '.m4a', '.flac', '.ogg'];

function catalogoSons() {
    const lista = [];
    try {
        const prontos = JSON.parse(fs.readFileSync(path.join(PASTA_SONS, 'sons.json'), 'utf-8'));
        for (const [id, s] of Object.entries(prontos)) {
            lista.push({ id, nome: s.nome, antecipar: s.antecipar || 0, caminho: path.join(PASTA_SONS, s.arquivo), meu: false });
        }
    } catch (e) {
        debugLog('Catálogo de sons não encontrado:', e.message);
    }
    try {
        for (const arq of fs.readdirSync(PASTA_SONS_USUARIO).sort()) {
            if (arq.startsWith('.') || !EXTENSOES_SOM.includes(path.extname(arq).toLowerCase())) continue;
            lista.push({ id: 'meu:' + arq, nome: path.parse(arq).name, antecipar: 0, caminho: path.join(PASTA_SONS_USUARIO, arq), meu: true });
        }
    } catch (_) { /* pasta ainda não existe */ }
    return lista;
}

// Troca os ids de som do spec pelo caminho do arquivo e aplica a antecipação
function resolverSons(spec, fps) {
    const porId = new Map(catalogoSons().map((s) => [s.id, s]));
    spec.sons = (spec.sons || []).map((ev) => {
        const s = porId.get(ev.som);
        if (!s) { debugLog('Som não encontrado:', ev.som); return null; }
        return { arquivo: s.caminho, frame: ev.frame - Math.round(s.antecipar * fps) };
    }).filter(Boolean);
    return spec;
}

function specComSons(params, duracao, fps, tempos, opcoes = {}) {
    return resolverSons(montarSpec(params, duracao, fps, tempos, opcoes), fps);
}

function dadosSom(_evento, id) {
    const s = catalogoSons().find((x) => x.id === id);
    if (!s) throw new Error('Som não encontrado: ' + id);
    const ext = path.extname(s.caminho).toLowerCase().slice(1);
    const mime = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' }[ext] || 'audio/aiff';
    return { ok: true, base64: fs.readFileSync(s.caminho).toString('base64'), mime };
}

async function abrirPastaSons() {
    fs.mkdirSync(PASTA_SONS_USUARIO, { recursive: true });
    await shell.openPath(PASTA_SONS_USUARIO);
    return { ok: true };
}

// =============================================================================
// Fusion Titles: templates para arrastar da Biblioteca de Efeitos para a timeline
// =============================================================================

const PASTA_TITULOS = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'Blackmagic Design', 'DaVinci Resolve', 'Support',
        'Fusion', 'Templates', 'Edit', 'Titles', 'DaVinci Textos Virais')
    : path.join(os.homedir(), 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve',
        'Fusion', 'Templates', 'Edit', 'Titles', 'DaVinci Textos Virais');

// titulos = [{nome, params, icone (PNG base64)}], formato = [largura, altura]
async function exportarTitulos(_evento, { titulos, formato }) {
    let fps = 24;
    try { fps = (await infoFps(await getTimeline())).fps; } catch (_) { /* sem timeline: 24 fps */ }
    const lista = titulos.map((t) => {
        const duracao = Math.max(12, Math.round((Number(t.params.duracao) || 3) * fps));
        // no título a saída fica logo após a entrada (o TimeStretcher a leva para o fim do clipe)
        const spec = montarSpec({ ...t.params, sons: false }, duracao, fps, null,
            { saidaAposEntrada: true, aspecto: formato[0] / formato[1] });
        return { nome: t.nome, duracao, spec, icone: t.icone };
    });
    // remove os títulos gerados por versões com o nome antigo (evita duplicados na Biblioteca)
    const pastaAntiga = path.join(path.dirname(PASTA_TITULOS), 'Netto Mello Motions');
    if (fs.existsSync(pastaAntiga)) {
        for (const arq of fs.readdirSync(pastaAntiga)) {
            if (/\.(setting|png)$/i.test(arq)) fs.rmSync(path.join(pastaAntiga, arq), { force: true });
        }
        try { fs.rmdirSync(pastaAntiga); } catch (_) { /* sobrou algo que não é nosso: deixa */ }
    }
    // recria a pasta do zero (assim templates apagados no plugin somem da Biblioteca)
    fs.mkdirSync(PASTA_TITULOS, { recursive: true });
    for (const arq of fs.readdirSync(PASTA_TITULOS)) {
        if (/\.(setting|png)$/i.test(arq)) fs.rmSync(path.join(PASTA_TITULOS, arq), { force: true });
    }
    debugLog(`Gerando ${lista.length} Fusion Titles (${formato.join('x')}, ${fps} fps)`);
    const r = await rodarFusion('exportar-titulos', { pasta: PASTA_TITULOS, formato, titulos: lista });
    return { ok: true, gerados: r.gerados, erros: r.erros, pasta: PASTA_TITULOS, fps };
}

async function abrirPastaTitulos() {
    fs.mkdirSync(PASTA_TITULOS, { recursive: true });
    await shell.openPath(PASTA_TITULOS);
    return { ok: true };
}

// =============================================================================
// Tela de preview
// =============================================================================

// Gera o mesmo "spec" que vai para o Fusion, para o preview desenhar a animação
function gerarSpec(_evento, params, fps, aspecto) {
    const f = Number(fps) || 24;
    const duracao = Math.max(1, Math.round((Number(params.duracao) || 3) * f));
    return { ok: true, spec: montarSpec(params, duracao, f, params.tempos, { aspecto: Number(aspecto) || 16 / 9 }), duracao };
}

// Resolução e fps da timeline atual (para o preview ter a mesma proporção)
async function infoTimeline() {
    try {
        const timeline = await getTimeline();
        const { fps } = await infoFps(timeline);
        const largura = parseInt(await timeline.GetSetting('timelineResolutionWidth'), 10);
        const altura = parseInt(await timeline.GetSetting('timelineResolutionHeight'), 10);
        if (largura && altura) return { ok: true, fps, largura, altura };
    } catch (e) {
        debugLog('infoTimeline via JavaScript falhou:', e.message);
    }
    try {
        const r = await rodarFusion('timeline');
        return { ok: true, fps: r.fps, largura: r.largura, altura: r.altura };
    } catch (_) {
        return { ok: true, fps: 24, largura: 1920, altura: 1080, padrao: true };
    }
}

// Envolve um handler: devolve {ok:false, erro} em vez de estourar exceção no renderer
function seguro(fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (e) {
            debugLog('ERRO:', e.stack || e.message);
            return { ok: false, erro: e.message };
        }
    };
}

function registrarHandlers() {
    ipcMain.handle('inserir-texto', seguro(inserirTexto));
    ipcMain.handle('atualizar-selecionado', seguro(atualizarSelecionado));
    ipcMain.handle('carregar-selecionado', seguro(async () => ({ ok: true, params: await carregarSelecionado() })));
    ipcMain.handle('obter-playhead', seguro(async () => ({ ok: true, timecode: await obterPlayhead() })));
    ipcMain.handle('listar-estilos', seguro(async () => ({ ok: true, estilos: listarEstilos(), saidas: listarSaidas() })));
    ipcMain.handle('listar-fontes', seguro(async () => ({ ok: true, fontes: await listarFontes() })));
    ipcMain.handle('escolher-arquivo', seguro(async () => ({ ok: true, arquivo: await escolherArquivo() })));
    ipcMain.handle('transcrever', seguro(transcrever));
    // Sons
    ipcMain.handle('listar-sons', seguro(async () => ({
        ok: true, sons: catalogoSons().map(({ id, nome, antecipar, meu }) => ({ id, nome, antecipar, meu })),
    })));
    ipcMain.handle('dados-som', seguro(dadosSom));
    ipcMain.handle('abrir-pasta-sons', seguro(abrirPastaSons));
    // Janela sempre por cima do DaVinci Resolve (botão "Fixar")
    ipcMain.handle('fixar-janela', seguro(async (_e, fixar) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            // nível "floating": fica acima das janelas normais (inclusive do Resolve)
            mainWindow.setAlwaysOnTop(!!fixar, 'floating');
            if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(!!fixar, { visibleOnFullScreen: true });
        }
        return { ok: true, fixada: mainWindow ? mainWindow.isAlwaysOnTop() : false };
    }));
    // Fusion Titles
    ipcMain.handle('exportar-titulos', seguro(exportarTitulos));
    ipcMain.handle('abrir-pasta-titulos', seguro(abrirPastaTitulos));
    // Preview
    ipcMain.handle('gerar-spec', seguro(gerarSpec));
    ipcMain.handle('info-timeline', seguro(infoTimeline));
    ipcMain.handle('quadro-timeline', seguro(async () => ({ ok: true, ...(await rodarFusion('quadro', { tamanho: 960 })) })));
    // Templates
    ipcMain.handle('listar-templates', seguro(async () => ({ ok: true, templates: todosTemplates() })));
    ipcMain.handle('salvar-template', seguro(salvarTemplate));
    ipcMain.handle('excluir-template', seguro(excluirTemplate));
}

// =============================================================================
// Janela
// =============================================================================

function createWindow() {
    mainWindow = new BrowserWindow({
        // controles à esquerda + preview à direita (abaixo de 860 px o preview vai para cima)
        width: 1180,
        height: 900,
        minWidth: 420,
        useContentSize: true,
        backgroundColor: '#1b1b1d',
        title: 'DaVinci Textos Virais',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // Modelo seguro recomendado pela Blackmagic (Resolve 19.0.2+): sandbox + context isolation
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    mainWindow.setMenu(null);
    mainWindow.on('close', () => app.quit());
    mainWindow.loadFile('index.html');
    // Para depurar, descomente:
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
    registrarHandlers();
    createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('quit', () => {
    try { WorkflowIntegration.CleanUp(); } catch (_) { /* ignorado */ }
});
