// DaVinci Textos Virais - preload
// Roda isolado (sandbox). Expõe para a interface (renderer.js) apenas as funções
// permitidas, em window.legendas. Cada função chama um canal IPC do main.js.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('legendas', {
    // Texto
    inserirTexto: (params) => ipcRenderer.invoke('inserir-texto', params),
    atualizarSelecionado: (params) => ipcRenderer.invoke('atualizar-selecionado', params),
    carregarSelecionado: () => ipcRenderer.invoke('carregar-selecionado'),
    obterPlayhead: () => ipcRenderer.invoke('obter-playhead'),
    // Listas para os menus
    listarEstilos: () => ipcRenderer.invoke('listar-estilos'),
    listarFontes: () => ipcRenderer.invoke('listar-fontes'),
    // Sons
    listarSons: () => ipcRenderer.invoke('listar-sons'),
    dadosSom: (id) => ipcRenderer.invoke('dados-som', id),
    abrirPastaSons: () => ipcRenderer.invoke('abrir-pasta-sons'),
    // Janela sempre por cima
    fixarJanela: (fixar) => ipcRenderer.invoke('fixar-janela', fixar),
    // Fusion Titles (arrastar da Biblioteca de Efeitos)
    exportarTitulos: (dados) => ipcRenderer.invoke('exportar-titulos', dados),
    abrirPastaTitulos: () => ipcRenderer.invoke('abrir-pasta-titulos'),
    // Preview
    gerarSpec: (params, fps, aspecto) => ipcRenderer.invoke('gerar-spec', params, fps, aspecto),
    infoTimeline: () => ipcRenderer.invoke('info-timeline'),
    quadroTimeline: () => ipcRenderer.invoke('quadro-timeline'),
    // Templates
    listarTemplates: () => ipcRenderer.invoke('listar-templates'),
    salvarTemplate: (nome, params) => ipcRenderer.invoke('salvar-template', nome, params),
    excluirTemplate: (id) => ipcRenderer.invoke('excluir-template', id),
    // Transcrição
    escolherArquivo: () => ipcRenderer.invoke('escolher-arquivo'),
    transcrever: (opcoes) => ipcRenderer.invoke('transcrever', opcoes),
    // Eventos vindos do main.js
    aoProgresso: (cb) => ipcRenderer.on('progresso', (_e, dados) => cb(dados)),
    aoLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
});
