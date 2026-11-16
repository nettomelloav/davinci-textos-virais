// Gera os dados da página a partir do próprio plugin (templates + motor do preview).
// As fontes do macOS são trocadas por equivalentes gratuitas do Google Fonts.
const fs = require('fs');
const path = require('path');
const PLUGIN = path.join(__dirname, '..', 'com.netto.editordelegendas');
const SITE = path.join(__dirname, 'site', 'assets');
const { listarTemplates } = require(path.join(PLUGIN, 'templates.js'));

const MAPA = {
    'Montserrat': 'Montserrat', 'Poppins': 'Poppins', 'Inter': 'Inter', 'Open Sans': 'Open Sans',
    'Hoefler Text': 'Playfair Display', 'Charter': 'Playfair Display', 'Baskerville': 'Playfair Display',
    'Georgia': 'Playfair Display', 'Times New Roman': 'Playfair Display',
    'Superclarendon': 'Bitter', 'Rockwell': 'Bitter',
    'Avenir Next': 'Nunito Sans', 'Helvetica Neue': 'Inter', 'Arial': 'Inter',
    'Futura': 'Jost', 'American Typewriter': 'Courier Prime', 'Courier New': 'Courier Prime',
    'Impact': 'Anton', 'Arial Black': 'Archivo Black',
};
const web = (f) => MAPA[[].concat(f || 'Inter')[0]] || 'Inter';

const templates = listarTemplates().map((t) => {
    const out = { ...t, fonte: web(t.fonte) };
    if (t.camadas) out.camadas = t.camadas.map((c) => (c.fonte ? { ...c, fonte: web(c.fonte) } : { ...c }));
    if (!t.camadas) out.texto = t.modo === 'palavra' ? 'Incrível' : 'Seu texto *viral*';
    return out;
});
fs.writeFileSync(path.join(SITE, 'dados.js'),
    '// Gerado por gerar_dados_site.js a partir do plugin. Não editar à mão.\nwindow.TEMPLATES = ' + JSON.stringify(templates) + ';\n');
for (const f of ['preview.js', 'estilos.js']) fs.copyFileSync(path.join(PLUGIN, f), path.join(SITE, 'motor', f));
const familias = [...new Set(templates.flatMap((t) => [t.fonte, ...(t.camadas || []).map((c) => c.fonte)]).filter(Boolean))];
console.log(templates.length, 'templates; fontes web:', familias.join(', '));
