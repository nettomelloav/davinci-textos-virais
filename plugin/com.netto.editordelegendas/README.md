# DaVinci Textos Virais: plugin Workflow Integration para o DaVinci Resolve Studio

Insere textos animados no estilo Reels (Text+ dentro de uma composição Fusion) e gera legendas
automaticamente com o faster-whisper.

Desenvolvido por **Netto Mello Videomaker**.

## Janela do plugin

- **Abas** (Templates, Texto, Efeitos, Som, Transcrição): cada assunto fica numa aba, sem precisar rolar a
  janela. O plugin lembra a última aba aberta.
- **Ações sempre visíveis:** Timecode, Playhead, Aplicar, Atualizar selecionado e Carregar dados ficam fixos
  embaixo da coluna, em qualquer aba.
- **📌 Fixar:** mantém a janela do plugin sempre **por cima do DaVinci Resolve**. Clique de novo para soltar.
  A escolha é lembrada na próxima vez que o plugin abrir.
- Preview à direita, e o rodapé com status e crédito.

## Arquivos

| Arquivo | Função |
|---|---|
| `manifest.xml` | Registro do plugin (Id `com.netto.editordelegendas`, `FilePath` main.js) |
| `main.js` | Processo principal: API JavaScript do Resolve, IPC e chamadas ao Python |
| `preload.js` | Expõe à interface só as funções permitidas (`window.legendas`) |
| `index.html` / `style.css` / `renderer.js` | Interface escura em português |
| `estilos.js` | **Estilos de animação.** Para criar um estilo novo, adicione uma entrada no objeto `ESTILOS` |
| `preview.js` | **Tela de preview**: desenha a animação num canvas com os mesmos keyframes enviados ao Fusion |
| `estilos.js` › `SAIDAS` | Animações de saída |
| `templates.js` | **Templates prontos** (estilo + fonte + cores + posição). Para criar um, copie um bloco da lista `TEMPLATES` |
| `python/legendas_fusion.py` | Monta o Text+, os keyframes e posiciona o clipe (roda no ResolvePython) |
| `sons/` + `python/gerar_sons.py` | Biblioteca de efeitos sonoros (sintetizados pelo próprio plugin) e o gerador |
| `python/transcrever.py` | Transcrição com faster-whisper (roda no venv) |
| `instalar_whisper.sh` | Cria o venv `~/Library/Application Support/EditorDeLegendas/venv` com o faster-whisper |
| `instalar_plugin.sh` | Copia o plugin para a pasta de plugins do Resolve (precisa de sudo) |

## Pré-requisitos

1. DaVinci Resolve **Studio** 21.1 ou mais novo (usa o ResolvePython embutido).
2. **Preferências > Sistema > Geral > External scripting using: Local**. Sem isso o script
   Python não consegue falar com o Resolve.
3. Para a transcrição: `./instalar_whisper.sh` (só uma vez). A primeira transcrição com cada
   modelo baixa esse modelo da internet (`small` tem cerca de 480 MB).

## Instalação

```bash
sudo ./instalar_plugin.sh
```

Se o plugin estiver num disco externo e o macOS bloquear o acesso do root a ele ("Operation not
permitted"), copie a pasta para o disco interno antes e rode o script de lá.

Depois **reinicie o Resolve**. O plugin aparece em **Workspace > Workflow Integrations > DaVinci Textos Virais**.

## Como testar

1. Abra um projeto com uma timeline que tenha um clipe no V1.
2. Abra o plugin. Em alguns segundos o campo **Fonte** passa a sugerir as fontes instaladas.
3. Digite um texto, escolha o estilo e clique em **Playhead** (ou digite um timecode), depois em **Aplicar**.
   O texto entra numa faixa de vídeo acima da edição, sem cortar nem empurrar nada no V1.
4. **Editar:** selecione o texto na timeline e clique em **Carregar dados do texto selecionado**.
   Mude o que quiser e clique em **Atualizar selecionado**. Com vários textos selecionados, cada um
   mantém o próprio texto e recebe o novo visual (estilo, fonte, cor, posição).
5. **Transcrição:** selecione o clipe com fala, abra "Transcrição automática", escolha o modo
   (frase curta, palavra ou segmento) e clique em **Transcrever e inserir**.

## Timelines verticais e com resolução própria

Uma timeline pode ter resolução diferente da do projeto (ex.: 1080×1920 para Reels num projeto
1920×1080). Nesse caso a composição Fusion nasceria com a resolução do projeto e o Resolve a
ampliaria, deixando o texto grande demais, cortado e fora da posição. O plugin ajusta cada
composição para a resolução da timeline. **Textos inseridos antes desta correção:** selecione-os
e clique em **Atualizar selecionado** para consertar.

## Tela de preview

A janela tem duas colunas: os controles à esquerda e a tela de preview à direita, ocupando todo o
espaço livre. Em janelas estreitas (menos de 860 px), o preview vai para cima dos controles.

### Editar com o mouse direto no preview

Com o mouse sobre a tela, a animação para num quadro em que o texto já está inteiro e aparece uma
caixa com alças:

- **Arrastar o texto** move (Posição X/Y). O texto "gruda" no centro da tela (linhas vermelhas);
  segure **Alt** para mover sem o ímã.
- **Puxar um canto** ou usar a **roda do mouse** aumenta ou diminui (Tamanho).
- **Clicar fora do texto** leva o texto até ali. **Duplo clique** centraliza na horizontal.
- Com a tela em foco: **setas** movem (Shift = passo maior), **+ / −** mudam o tamanho.

Os sliders do formulário acompanham tudo e o resultado vale para Aplicar / Atualizar selecionado.

- **Ao vivo:** qualquer mudança no formulário (texto, estilo, cores, tamanho, posição...) aparece na hora.
- **Templates:** passe o mouse num cartão e a tela mostra aquele template animado com o **seu** texto.
  Tire o mouse e ela volta ao formulário. Navegando pelos cartões com Tab, a prévia também acompanha.
- **Proporção:** a da timeline atual (atualizada quando você volta para a janela do plugin depois de trocar de timeline), ou 9:16, 16:9, 4:5 e 1:1. O tamanho do texto é relativo à
  largura da imagem, como no Fusion. Por isso, em 9:16 o mesmo tamanho fica menor.
- **Quadro:** usa como fundo o quadro do vídeo sob o playhead (sem as legendas do plugin). Clique de
  novo para voltar ao fundo padrão. **↻** recomeça a animação.

O preview foi calibrado comparando quadro a quadro com o Text+ renderizado no Resolve 21.2.
Montserrat, Inter e Poppins batem com diferença de 1 a 2%. O Open Sans que o Fusion usa é uma versão um
pouco diferente da instalada no sistema, por isso pode variar alguns por cento. O resultado final é sempre
o do Resolve.

## Animação de entrada e de saída

**Entrada** (Pop, Fade, Subindo, Digitação, Palavra destacada) e **Saída** são escolhidas
separadamente e combinam entre si. Saídas disponíveis:

| Saída | O que faz | Som automático |
|---|---|---|
| Nenhuma | corte seco | – |
| Fade out | some aos poucos | – |
| Encolher (pop out) | cresce um pouco e encolhe sumindo | bloop |
| Descendo / Subindo | desliza para baixo/cima sumindo | whoosh / swoosh |
| Deslizando para a esquerda/direita | sai pela lateral | whoosh |
| Apagando | desfaz o texto palavra por palavra | – |

"Automático" usa a saída padrão da entrada (o Fade sai com fade, as outras sem saída).
A **duração da saída** é em segundos (padrão 0,35 s; no máximo metade do clipe). Há também um
**som de saída** no bloco de efeitos sonoros. Para criar saídas novas, edite o objeto `SAIDAS` em
`estilos.js`.

## Arrastar templates para a timeline (Fusion Titles)

Em **Templates › Arrastar para a timeline**, escolha o formato (timeline atual, 9:16, 16:9, 4:5, 1:1)
e clique em **Instalar na Biblioteca**. O plugin gera um **Fusion Title** para cada template (os prontos
e os seus), com ícone, em:

`~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/Edit/Titles/DaVinci Textos Virais`

No Resolve, abra **Effects Library › Titles › Fusion Titles › DaVinci Textos Virais** e **arraste** o
template para a timeline, como qualquer título.

- **Inspector do título:** Texto, Fonte, Estilo da fonte e Cor do texto.
- **A saída sempre acontece no fim do clipe**, mesmo que você estique ou encurte o título. Isso é
  feito por um TimeStretcher com uma expressão que lê a duração do clipe.
- Os títulos guardam todos os parâmetros do template. Selecione um título arrastado e use
  **Carregar dados do texto selecionado** ou **Atualizar selecionado** no plugin: ele vira um texto
  normal do plugin, com o texto e a duração reais. Faça isso nos estilos palavra por palavra (Digitação e
  Karaokê) quando trocar o texto, para o ritmo das palavras acompanhar o texto novo.
- Títulos não têm áudio: os efeitos sonoros só entram pelo plugin (Aplicar ou Transcrever).
- Na primeira instalação, ou quando surgirem templates novos, **reinicie o DaVinci Resolve** para
  eles aparecerem na Biblioteca. Ao reinstalar, os títulos existentes são atualizados.

## Composições (letterings)

Na galeria, a seção **Composições (letterings)** traz 15 títulos com várias camadas de texto, cada
uma com fonte, tamanho, cor e efeito próprios. São misturas de sem serifa pesada com serifadas
itálicas, riscados e sublinhados coloridos, etiquetas, neon, letras espaçadas, números gigantes e
texto inclinado. Foram desenhadas a partir de referências de títulos virais, com textos em português.

Legenda Limpa · Luxo Roxo · Riscado Criativo · Neon Aqui · Inclinado Azul · Etiqueta Laranja ·
Impacto Verde · Neon Engajante · Texto para Vídeos · Elegante Dourado · Espaçado Roxo · Brilho Lilás ·
Número Gancho · Número Lista · Para Editores

- **Cada linha do campo Texto é uma camada.** Os riscados e sublinhados acompanham a palavra.
- As camadas entram **em cascata**. A **Saída** do formulário vale para todas, que saem juntas.
- **Tamanho** e **Posição X/Y** (ou o mouse no preview) movem e escalam a composição inteira.
- **Painel Camadas:** com uma composição ativa, cada linha tem fonte, peso e cor próprios (os riscados e
  sublinhados têm cor). "Fonte em todas as linhas" troca todas de uma vez. Ao trocar a fonte, o peso
  vira o estilo mais parecido que essa fonte tem. **texto simples** volta para a legenda normal.
- **Sons:** cada camada toca o som da sua entrada quando entra (pop, whoosh...). A camada principal usa
  o "Som de entrada" e a saída usa o "Som de saída".
- Em quadros **verticais**, os templates de composição ficam 1,8× maiores (o tamanho é relativo à
  largura).
- **Fusion Titles:** as composições também são instaladas na Biblioteca de Efeitos. O Inspector do
  título mostra **Posição geral** e **Escala geral** e, para cada linha, **texto, fonte, estilo e cor**.
  Ao trocar a fonte no Inspector, escolha também um estilo que ela tenha.
- **Transcrição:** com uma composição ativa, cada legenda usa o visual da camada principal.
- **Salvar template** com uma composição ativa salva a composição como template seu.

Para criar composições novas, edite `COMPOSICOES` em `templates.js`. O formato das camadas (escala,
dx/dy, âncora, espaçamento, ângulo, atraso, barras) está explicado em `estilos.js`, em
`montarSpecComposicao`.

## Efeitos do texto

Cada efeito, quando ligado, mostra seus controles:

| Efeito | Controles |
|---|---|
| Contorno | cor, espessura |
| Sombra | cor, opacidade, desfoque, distância X/Y (em tamanhos de texto; Y positivo = para baixo) |
| Brilho | cor própria ou a mesma do texto, intensidade, tamanho |
| Caixa de fundo | cor, opacidade, margem lateral e vertical, arredondamento |

Sombra e brilho podem ser usados juntos. No Text+, os efeitos ficam nos elementos de sombreamento
1 texto, 2 contorno, 3 sombra, 4 brilho e 5 caixa. Os de número maior ficam atrás, por isso o
brilho aparece por cima da caixa.

## Efeitos sonoros

Cada texto pode tocar sons sincronizados com a animação. O bloco **Efeitos sonoros** do formulário tem:

- **Som de entrada:** toca quando o texto aparece.
- **Som por palavra:** toca a cada palavra nos estilos que revelam palavra por palavra (Digitação e
  Palavra destacada sem asteriscos). Na transcrição, usa o tempo real de cada palavra falada.
- **Automático** usa o som padrão do estilo: Pop → pop, Fade → deslizar, Subindo → swoosh,
  Digitação → clique por palavra, Palavra destacada → pop. **Nenhum** desliga.
- **Volume** em dB e **▶** para ouvir antes.

Sons incluídos: Pop, Bloop, Whoosh, Swoosh subindo, Deslizar, Clique de teclado, Tique, Ding,
Impacto, Brilho e Glitch. Todos são sintetizados pelo próprio plugin (`python/gerar_sons.py`),
sem samples de terceiros. Whoosh, swoosh e deslizar começam um pouco antes do texto, para que o
pico do som coincida com a entrada.

**Na timeline:**
- Os sons entram em faixas de áudio chamadas **SFX Legendas**. O plugin cria mais faixas se
  precisar evitar sobreposição.
- Os arquivos são importados para a pasta **DaVinci Textos Virais - Sons** do Media Pool.
- Cada som fica **vinculado** ao seu texto: mover ou apagar o texto leva os sons junto.
- **Atualizar selecionado** troca os sons antigos pelos novos.

**Seus sons:** clique em *Meus sons…*, coloque arquivos .wav/.mp3/.aif/.m4a na pasta que abrir
(`~/Library/Application Support/EditorDeLegendas/sons`) e reabra o plugin. Eles aparecem em
"Meus sons" nos menus.

**No preview:** os sons tocam junto com a animação, inclusive ao passar o mouse nos templates.
O botão 🔊 da tela de preview liga e desliga o som. Os templates também guardam a escolha de sons.

## Templates

No topo do plugin há uma galeria com 14 templates prontos: Reels Clássico, Karaokê Amarelo/Verde,
Uma Palavra por Vez, Impacto, Tarja Preta, Etiqueta Amarela/Branca, Neon, Neon Rosa, Minimalista,
Máquina de Escrever, Subindo Suave e Título Central.

- Clicar num template **preenche o formulário** (estilo, fonte, cores, contorno, caixa, maiúsculas,
  tamanho, posição e, em alguns, o modo da transcrição). O texto e o timecode não mudam.
  Depois é só clicar em **Aplicar**, em **Atualizar selecionado** (que também serve para trocar o
  visual de várias legendas de uma vez) ou em **Transcrever e inserir**.
- Cada template indica várias fontes em ordem de preferência; o plugin usa a primeira instalada.
- **Usar a minha fonte em todos os templates:** marcada, os templates mantêm a fonte e o peso
  escolhidos no formulário (os cartões e a prévia passam a mostrar a sua fonte).

## Fontes

O plugin nunca aplica uma combinação de fonte e estilo que o Fusion não conheça (isso causava o aviso
"Fonts Not Found" e o texto não aparecia). Estilo inexistente vira o mais parecido da mesma fonte;
fonte inexistente vira Open Sans.

O campo **Fonte** abre a lista completa das fontes que o DaVinci/Fusion reconhece, cada uma
desenhada na própria fonte e com a quantidade de estilos. Digite para filtrar, use as setas e Enter.
O menu **Peso** mostra todos os estilos da fonte escolhida (Regular, Bold, Black, Italic...).
- **Salvar template:** ajuste o formulário, digite um nome e clique em *Salvar template*. Os seus
  templates aparecem com a marca "meu" e são excluídos pelo × no canto do cartão. Eles ficam em
  `~/Library/Application Support/EditorDeLegendas/templates.json` e por isso continuam lá quando o
  plugin é reinstalado.

`*palavra*` entre asteriscos fica destacada o tempo todo no estilo "Palavra destacada". Sem
asteriscos, o destaque acompanha a fala, palavra por palavra.

Para depurar, descomente `openDevTools` no `createWindow()` do `main.js`.

## Limitações conhecidas

- **Duração máxima** de cada texto = "Standard generator duration" (Preferências > Usuário > Edição;
  o padrão é 5 s). A API não deixa esticar a composição além disso.
- `InsertFusionCompositionIntoTimeline` faz um insert com ripple. Por isso o plugin insere no
  fim da timeline e depois move o clipe com `SetPosition`. Se a faixa de vídeo mais alta estiver
  ocupada no trecho, ele cria uma faixa nova.
- A API JavaScript (WorkflowIntegration.node) não acessa os nós do Fusion. Toda a parte de
  Text+ e keyframes é feita pelo `python/legendas_fusion.py`.
