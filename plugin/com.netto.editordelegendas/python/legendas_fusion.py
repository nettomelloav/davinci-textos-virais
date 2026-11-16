# -*- coding: utf-8 -*-
"""
DaVinci Textos Virais - script auxiliar em Python.

Por que existe:
  A API JavaScript do Workflow Integration (WorkflowIntegration.node) dá acesso aos
  objetos do Resolve (Projeto, Timeline, TimelineItem...), mas NÃO aos objetos do
  Fusion (ferramentas, inputs, splines de animação). Para criar o nó Text+ e os
  keyframes, o plugin chama este script com o Python embutido do Resolve
  (ResolvePython), que fala com o Resolve pela API de scripting.

Uso (chamado pelo main.js via child_process):
  ResolvePython legendas_fusion.py <comando> [arquivo.json]

  A resposta é sempre UM objeto JSON impresso no stdout. Mensagens de log vão para o stderr.

Comandos:
  fontes        -> lista de fontes instaladas que o Fusion reconhece
  timeline      -> informações da timeline atual (fps, início, fim, playhead)
  selecionados  -> clipes selecionados na timeline (com os dados salvos pelo plugin)
  info-clipe    -> arquivo de mídia do clipe selecionado (ou sob o playhead), para transcrição
  quadro        -> quadro do vídeo sob o playhead (JPEG base64) para o fundo do preview
  exportar-titulos -> gera Fusion Titles (.setting) dos templates para a Biblioteca de Efeitos
  aplicar       -> recebe {"jobs": [...]} e, para cada job, insere (se preciso),
                   posiciona e configura a composição Fusion com o texto animado
"""

import json
import os
import re
import sys
import time
import traceback
# OrderedDict precisa estar no escopo do script principal para tool.SaveSettings() funcionar
from collections import OrderedDict

CHAVE_DADOS = "EditorDeLegendas"   # chave usada para salvar os parâmetros dentro da composição
CHAVE_TITULO = "NettoMelloMotions"   # CustomData do macro dos Fusion Titles exportados
CHAVE_SONS = "EditorDeLegendasSons"  # UniqueIds dos clipes de som ligados a este texto
PASTA_SONS = "DaVinci Textos Virais - Sons"   # pasta do Media Pool com os efeitos importados
# nomes usados em versões anteriores (projetos antigos continuam funcionando)
PASTAS_SONS_ANTIGAS = ("Netto Mello Motions - Sons", "Editor de Legendas - Sons")
FAIXA_SFX = "SFX Textos Virais"    # nome das faixas de áudio usadas para os efeitos
FAIXAS_SFX_ANTIGAS = ("SFX Motions", "SFX Legendas")
PREFIXO = "Legenda"                # todo nó criado pelo plugin começa com este nome


def log(*args):
    """Escreve no stderr (o main.js repassa para o console do plugin)."""
    print(*args, file=sys.stderr, flush=True)


def responder(obj):
    """Imprime a resposta JSON no stdout e encerra."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Conexão com o Resolve
# ---------------------------------------------------------------------------

def conectar():
    """Conecta ao Resolve que está aberto. Requer em Preferências > Sistema > Geral:
    'Scripting externo usando: Local' (External scripting using: Local)."""
    try:
        import DaVinciResolveScript as dvr
    except ImportError:
        # Python externo: tenta o caminho padrão do módulo no macOS / Windows
        import os
        for p in (
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
            os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        ):
            if os.path.isdir(p):
                sys.path.append(p)
        import DaVinciResolveScript as dvr
    global DVR
    DVR = dvr
    resolve = dvr.scriptapp("Resolve")
    global RESOLVE
    RESOLVE = resolve
    if not resolve:
        raise RuntimeError(
            "Não foi possível conectar ao DaVinci Resolve. Verifique se ele está aberto e se "
            "Preferências > Sistema > Geral > 'External scripting using' está como 'Local'."
        )
    return resolve


DVR = None       # módulo DaVinciResolveScript (writestring/readstring)
RESOLVE = None   # objeto Resolve (para consultar as fontes do Fusion)


def obter_timeline(resolve):
    projeto = resolve.GetProjectManager().GetCurrentProject()
    if not projeto:
        raise RuntimeError("Nenhum projeto aberto.")
    timeline = projeto.GetCurrentTimeline()
    if not timeline:
        raise RuntimeError("Nenhuma timeline aberta.")
    return projeto, timeline


# ---------------------------------------------------------------------------
# Timecode <-> frames (inclui drop frame para 29,97 / 59,94)
# ---------------------------------------------------------------------------

def info_fps(timeline):
    fps = float(timeline.GetSetting("timelineFrameRate") or 24)
    df = str(timeline.GetSetting("timelineDropFrameTimecode") or "0") == "1"
    return fps, int(round(fps)), df


def frames_para_tc(frame, timeline):
    """Converte um número de frame ABSOLUTO da timeline em timecode 'HH:MM:SS:FF'."""
    _, base, df = info_fps(timeline)
    f = int(round(frame))
    if df and base in (30, 60):
        # Algoritmo clássico de drop frame (pula 2 ou 4 números por minuto, exceto a cada 10)
        drop = 2 if base == 30 else 4
        por_10min = base * 600 - drop * 9
        por_min = base * 60 - drop
        d, m = divmod(f, por_10min)
        if m > drop:
            f += drop * 9 * d + drop * ((m - drop) // por_min)
        else:
            f += drop * 9 * d
    h, resto = divmod(f, base * 3600)
    mi, resto = divmod(resto, base * 60)
    s, fr = divmod(resto, base)
    sep = ";" if df else ":"
    return "%02d:%02d:%02d%s%02d" % (h % 24, mi, s, sep, fr)


# ---------------------------------------------------------------------------
# Localização de clipes
# ---------------------------------------------------------------------------

def todos_itens_video(timeline):
    for faixa in range(1, timeline.GetTrackCount("video") + 1):
        for item in timeline.GetItemListInTrack("video", faixa) or []:
            yield faixa, item


def achar_por_uid(timeline, uid):
    for _, item in todos_itens_video(timeline):
        if item.GetUniqueId() == uid:
            return item
    return None


def macro_do_titulo(comp):
    """Num título arrastado da Biblioteca de Efeitos, devolve (macro, dados) do DaVinci Textos Virais."""
    for tool in (comp.GetToolList(False) or {}).values():
        try:
            bruto = tool.GetData(CHAVE_TITULO)
        except Exception:
            bruto = None
        if bruto:
            return tool, json.loads(bruto)
    return None, None


def dados_do_item(item):
    """Lê os parâmetros que o plugin salvou dentro da composição (se houver).
    Também reconhece os Fusion Titles do plugin arrastados direto da Biblioteca de Efeitos."""
    try:
        if item.GetFusionCompCount() < 1:
            return None
        comp = item.GetFusionCompByIndex(1)
        bruto = comp.GetData(CHAVE_DADOS)
        if bruto:
            return json.loads(bruto)
        macro, dados = macro_do_titulo(comp)
        if dados:
            params = dict(dados.get("params") or {})
            # o texto pode ter sido editado no Inspector do título
            # texto atual (pode ter sido editado no Inspector do título)
            interno = comp.FindTool(PREFIXO + "Texto")
            texto = interno.GetInput("StyledText") if interno else None
            if params.get("camadas"):
                # composição: junta o texto atual de cada camada (as barras não contam)
                linhas = []
                for n, camada in enumerate(params["camadas"]):
                    if camada.get("segue") is None:
                        t = comp.FindTool(PREFIXO + "Texto" + ("" if n == 0 else str(n + 1)))
                        linhas.append(t.GetInput("StyledText") if t else camada.get("texto", ""))
                texto = "\n".join(linhas)
            if texto:
                params["texto"] = texto
            params["origem"] = "titulo"
            return params
        return None
    except Exception:
        return None


def descrever_item(item):
    tipo, faixa = item.GetTrackTypeAndIndex()
    return {
        "uid": item.GetUniqueId(),
        "nome": item.GetName(),
        "tipoFaixa": tipo,
        "faixa": faixa,
        "inicio": item.GetStart(),
        "fim": item.GetEnd(),
        "duracao": item.GetDuration(),
        "dados": dados_do_item(item),
    }


# ---------------------------------------------------------------------------
# Inserção e posicionamento seguro da composição
# ---------------------------------------------------------------------------
#
# InsertFusionCompositionIntoTimeline() faz um "insert" (com ripple) no playhead, o que
# cortaria e empurraria os clipes do V1. Para não estragar a edição:
#   1. move o playhead para o FIM da timeline (nada depois dele para empurrar);
#   2. insere a composição ali;
#   3. apara a duração com SetRightOffset();
#   4. move o clipe para o frame/faixa desejados com SetPosition().

def escolher_faixa(timeline, intervalos, ignorar=()):
    """Escolhe a faixa de legenda: a faixa de vídeo mais alta (nunca a V1) se todos os
    intervalos couberem nela; senão cria uma faixa nova no topo."""
    total = timeline.GetTrackCount("video")
    if total >= 2:
        livre = True
        for a, b in intervalos:
            for item in timeline.GetItemListInTrack("video", total) or []:
                if item.GetUniqueId() in ignorar:
                    continue
                if item.GetStart() < b and item.GetEnd() > a:
                    livre = False
                    break
            if not livre:
                break
        if livre:
            return total
    timeline.AddTrack("video")
    return timeline.GetTrackCount("video")


def garantir_faixa(timeline, faixa):
    while timeline.GetTrackCount("video") < faixa:
        timeline.AddTrack("video")


def inserir_composicao(timeline, duracao):
    """Insere uma composição Fusion no fim da timeline e apara para 'duracao' frames.
    Retorna (item, duracao_real, aviso)."""
    timeline.SetCurrentTimecode(frames_para_tc(timeline.GetEndFrame(), timeline))
    item = timeline.InsertFusionCompositionIntoTimeline()
    if not item:
        raise RuntimeError("InsertFusionCompositionIntoTimeline falhou (faixas travadas?).")
    aviso = None
    dur_inicial = int(item.GetDuration())
    duracao = int(duracao)
    if duracao < dur_inicial:
        item.SetRightOffset(dur_inicial - duracao)
    elif duracao > dur_inicial:
        # A composição nasce com a "duração padrão de gerador" das Preferências e não
        # pode ser esticada via API. Avisa o usuário.
        aviso = ("Duração limitada a %d frames (duração padrão de geradores). Aumente em "
                 "Preferências > Usuário > Edição > Standard generator duration." % dur_inicial)
    return item, int(item.GetDuration()), aviso


def posicionar(item, faixa, frame):
    ok = item.SetPosition({"trackIndex": int(faixa), "startFrame": int(frame)})
    if not ok:
        raise RuntimeError("Não foi possível mover o texto para V%d no frame %d (espaço ocupado?)."
                           % (faixa, frame))


# ---------------------------------------------------------------------------
# Construção da composição Fusion
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Fontes: só aplica combinações (fonte + estilo) que o Fusion conhece
# ---------------------------------------------------------------------------
# Se o Text+ recebe uma fonte/estilo inexistente, o Resolve mostra "Fonts Not Found" e o
# texto não aparece. Por isso toda fonte passa por aqui: estilo inexistente vira o estilo
# mais parecido da mesma fonte; fonte inexistente vira uma fonte comum instalada.

_FONTES = None
FONTES_RESERVA = ("Open Sans", "Montserrat", "Helvetica Neue", "Arial")


def fontes_fusion():
    global _FONTES
    if _FONTES is None:
        try:
            _FONTES = RESOLVE.Fusion().FontManager.GetFontList() or {}
        except Exception:
            _FONTES = {}
    return _FONTES


def peso_e_italico(estilo):
    e = (estilo or "").lower().replace(" ", "")
    italico = "italic" in e or "oblique" in e
    for chave, peso in (("black", 900), ("heavy", 900), ("extrabold", 800), ("ultrabold", 800), ("semibold", 600),
                        ("demibold", 600), ("bold", 700), ("medium", 500), ("extralight", 200), ("ultralight", 200),
                        ("thin", 100), ("hairline", 100), ("light", 300)):
        if chave in e:
            return peso, italico
    return 400, italico


def estilo_mais_proximo(estilos, desejado):
    if desejado in estilos:
        return desejado
    peso, italico = peso_e_italico(desejado)
    def custo(e):
        p, i = peso_e_italico(e)
        return (0 if i == italico else 1000) + abs(p - peso)
    return min(estilos, key=custo)


def fonte_valida(fonte, estilo):
    """Devolve (fonte, estilo) existentes no Fusion, o mais perto possível do pedido."""
    lista = fontes_fusion()
    if not lista:
        return fonte, estilo
    if fonte not in lista:
        achou = [f for f in lista if f.lower() == str(fonte).lower()]
        if achou:
            fonte = achou[0]
        else:
            log("Fonte '%s' não instalada; usando outra." % fonte)
            fonte = next((f for f in FONTES_RESERVA if f in lista), sorted(lista)[0])
    estilos = list((lista.get(fonte) or {}).keys())
    if estilos and estilo not in estilos:
        novo = estilo_mais_proximo(estilos, estilo)
        log("Fonte '%s' não tem o estilo '%s'; usando '%s'." % (fonte, estilo, novo))
        estilo = novo
    return fonte, estilo


def definir_inputs_base(tool, spec):
    """Texto, fonte, cor, tamanho, posição e contorno/sombra."""
    tool.SetInput("StyledText", spec.get("texto", ""))
    fonte, estilo = fonte_valida(spec.get("fonte") or "Open Sans", spec.get("estiloFonte") or "Bold")
    tool.SetInput("Font", fonte)
    tool.SetInput("Style", estilo)
    r, g, b = spec.get("cor", [1, 1, 1])
    if float(spec.get("alphaTexto", 1)) <= 0:
        # Texto invisível (barras de riscado/sublinhado): DESLIGA o preenchimento. Deixar só
        # transparente não serve: com alpha 0 o preenchimento "fura" a caixa no formato das
        # letras e o riscado parece passar por trás do texto (testado no Resolve 21.2).
        r, g, b = 0, 0, 0
        tool.SetInput("Alpha1", 0)
        tool.SetInput("Enabled1", 0)
    else:
        tool.SetInput("Enabled1", 1)
    tool.SetInput("Red1", r)
    tool.SetInput("Green1", g)
    tool.SetInput("Blue1", b)
    tool.SetInput("Size", float(spec.get("tamanho", 0.08)))
    tool.SetInput("Center", list(spec.get("centro", [0.5, 0.5])))
    if spec.get("layout") == "ponto":
        # Composições: layout "Point", sem quebra; a âncora diz onde o texto se apoia no Center
        tool.SetInput("LayoutType", 0)
    else:
        # Legenda: Text Box com quebra de linha automática, típico de Reels
        tool.SetInput("LayoutType", 1)
        tool.SetInput("LayoutWidth", float(spec.get("largura", 0.85)))
        tool.SetInput("LayoutHeight", 0.6)
        tool.SetInput("Wrap", 1)
    tool.SetInput("HorizontalLeftCenterRight", {"esquerda": -1, "direita": 1}.get(spec.get("ancora"), 0))
    tool.SetInput("CharacterSpacingClone", float(spec.get("tracking", 1)))   # +1 = + um tamanho entre letras
    tool.SetInput("AngleZ", float(spec.get("angulo", 0)))                     # graus, anti-horário

    # Elementos de sombreamento do Text+ (números MAIORES ficam ATRÁS - testado no Resolve 21.2):
    #   1 preenchimento · 2 contorno · 3 sombra · 4 brilho · 5 caixa de fundo
    # Os inputs de cada elemento só existem depois que ele é ligado (EnabledN = 1).

    # Elemento 2 = contorno
    if spec.get("contorno"):
        cr, cg, cb = spec.get("corContorno", [0, 0, 0])
        tool.SetInput("Enabled2", 1)
        tool.SetInput("ElementShape2", 1)
        tool.SetInput("Thickness2", float(spec.get("espessuraContorno", 0.06)))
        tool.SetInput("Red2", cr)
        tool.SetInput("Green2", cg)
        tool.SetInput("Blue2", cb)
        tool.SetInput("Alpha2", 1)
        tool.SetInput("Opacity2", 1)
    else:
        tool.SetInput("Enabled2", 0)

    # Elemento 3 = sombra (cor, opacidade, desfoque e deslocamento próprios)
    if spec.get("sombra"):
        sr, sg, sb = spec.get("corSombra", [0, 0, 0])
        dx, dy = spec.get("deslocSombra", [0.03, -0.05])   # em tamanhos de texto
        suave = float(spec.get("suavidadeSombra", 6))
        tool.SetInput("Enabled3", 1)
        tool.SetInput("ElementShape3", 0)
        tool.SetInput("Red3", sr)
        tool.SetInput("Green3", sg)
        tool.SetInput("Blue3", sb)
        tool.SetInput("Alpha3", 1)
        tool.SetInput("SoftnessX3", suave)
        tool.SetInput("SoftnessY3", suave)
        tool.SetInput("Offset3", [float(dx), float(dy)])
        tool.SetInput("Opacity3", float(spec.get("opacidadeSombra", 0.8)))
    else:
        tool.SetInput("Enabled3", 0)

    # Elemento 4 = brilho (glow): cópia desfocada do texto, sem deslocamento
    if spec.get("brilho"):
        br, bg, bb = spec.get("corBrilho") or [r, g, b]
        tam = float(spec.get("tamanhoBrilho", 14))
        tool.SetInput("Enabled4", 1)
        tool.SetInput("ElementShape4", 0)
        tool.SetInput("Level4", 0)
        tool.SetInput("Red4", br)
        tool.SetInput("Green4", bg)
        tool.SetInput("Blue4", bb)
        tool.SetInput("Alpha4", 1)
        tool.SetInput("SoftnessX4", tam)
        tool.SetInput("SoftnessY4", tam)
        tool.SetInput("Offset4", [0, 0])
        tool.SetInput("ExtendHorizontal4", 0)
        tool.SetInput("ExtendVertical4", 0)
        tool.SetInput("Opacity4", float(spec.get("intensidadeBrilho", 1)))
    else:
        tool.SetInput("Enabled4", 0)

    # Elemento 5 = caixa de fundo atrás de cada linha (estilo legenda com tarja)
    if spec.get("fundo"):
        fr, fg, fb = spec.get("corFundo", [0, 0, 0])
        tool.SetInput("Enabled5", 1)
        tool.SetInput("ElementShape5", 2)      # Border Fill
        tool.SetInput("Level5", 1)             # uma caixa por linha
        tool.SetInput("Red5", fr)
        tool.SetInput("Green5", fg)
        tool.SetInput("Blue5", fb)
        tool.SetInput("Alpha5", 1)
        tool.SetInput("SoftnessX5", 0)
        tool.SetInput("SoftnessY5", 0)
        tool.SetInput("Opacity5", float(spec.get("opacidadeFundo", 0.85)))
        tool.SetInput("ExtendHorizontal5", float(spec.get("margemFundoX", 0.25)))
        tool.SetInput("ExtendVertical5", float(spec.get("margemFundoY", 0.1)))
        tool.SetInput("Round5", float(spec.get("arredondarFundo", 0.3)))
        # deslocamento da caixa: em LARGURAS de imagem (medido; diferente da sombra)
        tool.SetInput("Offset5", [float(v) for v in spec.get("deslocFundo", [0, 0])])
    else:
        tool.SetInput("Enabled5", 0)


def aplicar_animacoes(comp, tool, animacoes, inicio_comp):
    """Cada animação é {"input": "Size", "tipo": "numero"|"ponto", "keys": [[frame, valor], ...]}.
    Os frames são relativos ao início do clipe; somamos o RenderStart da composição."""
    agora = comp.CurrentTime
    for anim in animacoes or []:
        nome = anim["input"]
        keys = anim.get("keys") or []
        if not keys:
            continue
        # Alguns inputs só existem com o elemento ligado (ex.: Opacity3 com a sombra desligada)
        if tool[nome] is None:
            continue
        # Desconecta animação anterior (em caso de atualização) e conecta uma spline nova
        tool[nome].ConnectTo(None)
        if anim.get("tipo") == "ponto":
            tool[nome] = comp.XYPath()   # X e Y como curvas separadas (keyframes exatos)
        else:
            tool[nome] = comp.BezierSpline()
        frames = set()
        for f, v in keys:
            fr = inicio_comp + int(round(f))
            frames.add(fr)
            tool[nome][fr] = list(v) if isinstance(v, (list, tuple)) else float(v)
        # A spline nasce com um keyframe no frame atual; remove se não for nosso
        if agora not in frames:
            try:
                tool[nome][agora] = None
            except Exception:
                pass


def remover_nos_do_plugin(comp):
    macro, _ = macro_do_titulo(comp)
    if macro:
        macro.Delete()   # título da Biblioteca de Efeitos: vira composição normal do plugin
    for tool in list((comp.GetToolList(False) or {}).values()):
        if str(tool.Name).startswith(PREFIXO):
            tool.Delete()


def resolucao_timeline(timeline):
    """Resolução real da timeline (vale a configuração própria da timeline, ex.: 1080x1920)."""
    try:
        return int(timeline.GetSetting("timelineResolutionWidth")), int(timeline.GetSetting("timelineResolutionHeight"))
    except (TypeError, ValueError):
        return None


def construir_camada(comp, spec, nome, inicio_comp):
    """Cria o Text+ de uma camada (e as camadas de destaque dela). Devolve o último nó."""
    base = comp.TextPlus()
    base.SetAttrs({"TOOLS_Name": nome})
    base.SetAttrs({"TOOLB_PassThrough": False})
    definir_inputs_base(base, spec)
    aplicar_animacoes(comp, base, spec.get("animacoes"), inicio_comp)
    base.SetInput("Start", 0)
    if not any(a["input"] == "End" for a in spec.get("animacoes") or []):
        base.SetInput("End", 1)
    ultimo = base

    # Camadas de destaque: cópias do Text+ que mostram só um trecho (Write On)
    # com outra cor, sobrepostas exatamente em cima do texto base.
    for i, dest in enumerate(spec.get("destaques") or []):
        camada = comp.TextPlus()
        camada.SetAttrs({"TOOLS_Name": "%sDestaque%d" % (nome, i + 1)})
        spec_dest = dict(spec)
        spec_dest["cor"] = dest.get("cor", [1, 0.85, 0])
        spec_dest["sombra"] = False
        spec_dest["brilho"] = False
        spec_dest["fundo"] = False   # a caixa já está desenhada pelo texto base
        definir_inputs_base(camada, spec_dest)
        # Repete as animações de movimento/escala do texto base para ficar alinhado
        anims = [a for a in (spec.get("animacoes") or []) if a["input"] not in ("Start", "End")]
        aplicar_animacoes(comp, camada, anims + (dest.get("animacoes") or []), inicio_comp)
        if "inicio" in dest:
            camada.SetInput("Start", float(dest["inicio"]))
            camada.SetInput("End", float(dest["fim"]))

        merge = comp.Merge()
        merge.SetAttrs({"TOOLS_Name": "%sMerge%d" % (nome, i + 1)})
        merge.Background = ultimo.Output
        merge.Foreground = camada.Output
        ultimo = merge
    return ultimo


def configurar_composicao(item, spec, formato=None):
    comp = item.GetFusionCompByIndex(1) if item.GetFusionCompCount() >= 1 else None
    if not comp:
        raise RuntimeError("O clipe '%s' não tem composição Fusion." % item.GetName())

    attrs = comp.GetAttrs()
    inicio_comp = int(attrs.get("COMPN_RenderStart", 0))

    # IMPORTANTE: a composição nasce com a resolução do PROJETO. Numa timeline com resolução
    # própria (ex.: vertical 1080x1920 num projeto 1920x1080) o Resolve amplia a imagem para
    # preencher a tela, e o texto fica maior, cortado e fora da posição. Por isso a composição
    # recebe sempre a resolução da timeline: Size e Center passam a valer para o quadro real.
    if formato:
        largura, altura = formato
        if (int(comp.GetPrefs("Comp.FrameFormat.Width") or 0), int(comp.GetPrefs("Comp.FrameFormat.Height") or 0)) != (largura, altura):
            comp.SetPrefs({"Comp.FrameFormat.Width": largura, "Comp.FrameFormat.Height": altura})

    comp.Lock()          # evita diálogos e acelera a criação dos nós
    comp.StartUndo("DaVinci Textos Virais")
    try:
        remover_nos_do_plugin(comp)

        # Composições têm várias camadas; uma legenda comum é uma camada só
        camadas = spec.get("camadas") or [spec]
        ultimo = None
        for n, camada in enumerate(camadas):
            nome = PREFIXO + "Texto" + ("" if n == 0 else str(n + 1))
            saida_camada = construir_camada(comp, camada, nome, inicio_comp)
            if ultimo is None:
                ultimo = saida_camada
            else:
                juntar = comp.Merge()
                juntar.SetAttrs({"TOOLS_Name": "%sCamada%d" % (PREFIXO, n + 1)})
                juntar.Background = ultimo.Output
                juntar.Foreground = saida_camada.Output
                ultimo = juntar

        # Liga a última saída ao MediaOut
        media_out = comp.FindToolByID("MediaOut") or comp.FindTool("MediaOut1")
        if not media_out:
            media_out = comp.MediaOut()
        media_out.Input = ultimo.Output

        # Salva os parâmetros para o botão "Carregar do selecionado"
        comp.SetData(CHAVE_DADOS, json.dumps(spec.get("params") or {}, ensure_ascii=False))
    finally:
        comp.EndUndo(True)
        comp.Unlock()

    # Nome do clipe na timeline = início do texto (facilita achar a legenda)
    texto = (spec.get("texto") or "").replace("\n", " ").strip()
    try:
        item.SetName(("T: " + texto)[:40])
        item.SetClipColor(spec.get("corClipe") or "Orange")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Efeitos sonoros
# ---------------------------------------------------------------------------
#
# Cada texto pode ter sons (entrada, palavra por palavra...). Eles entram em faixas de
# áudio chamadas "SFX Legendas" (cria quantas forem precisas para não sobrepor), com o
# volume escolhido, e ficam VINCULADOS ao clipe do texto (SetClipsLinked): mover ou
# apagar o texto leva os sons junto. Os UniqueIds ficam salvos na composição para que
# "Atualizar selecionado" troque os sons antigos pelos novos.

def duracao_em_frames(caminho, mpi, fps):
    import math
    segundos = None
    if caminho.lower().endswith(".wav"):
        try:
            import wave
            with wave.open(caminho, "rb") as w:
                segundos = w.getnframes() / float(w.getframerate())
        except Exception:
            segundos = None
    if segundos is None:
        # outros formatos: usa a duração que o Resolve calculou (timecode HH:MM:SS:FF)
        try:
            h, m, s_, f = [int(x) for x in str(mpi.GetClipProperty("Duration")).replace(";", ":").split(":")]
            segundos = h * 3600 + m * 60 + s_ + f / max(1.0, float(mpi.GetClipProperty("FPS") or fps))
        except Exception:
            segundos = 1.0
    return max(1, int(math.ceil(segundos * fps - 1e-6)))


def obter_pasta_sons(media_pool):
    raiz = media_pool.GetRootFolder()
    for pasta in raiz.GetSubFolderList() or []:
        if pasta.GetName() == PASTA_SONS:
            return pasta
    for pasta in raiz.GetSubFolderList() or []:
        if pasta.GetName() in PASTAS_SONS_ANTIGAS:   # projetos feitos antes da troca de nome
            return pasta
    return media_pool.AddSubFolder(raiz, PASTA_SONS)


def itens_de_som(media_pool, caminhos):
    """Devolve {caminho: MediaPoolItem}, importando para a pasta de sons o que faltar."""
    pasta = obter_pasta_sons(media_pool)
    existentes = {c.GetClipProperty("File Path"): c for c in (pasta.GetClipList() or [])}
    faltando = [c for c in caminhos if c not in existentes]
    if faltando:
        atual = media_pool.GetCurrentFolder()
        media_pool.SetCurrentFolder(pasta)
        for novo in media_pool.ImportMedia(faltando) or []:
            existentes[novo.GetClipProperty("File Path")] = novo
        if atual:
            media_pool.SetCurrentFolder(atual)
    return existentes


def faixas_sfx(timeline):
    nomes = (FAIXA_SFX,) + FAIXAS_SFX_ANTIGAS
    return [i for i in range(1, timeline.GetTrackCount("audio") + 1)
            if str(timeline.GetTrackName("audio", i) or "").startswith(nomes)]


def nova_faixa_sfx(timeline):
    timeline.AddTrack("audio", "stereo")
    n = timeline.GetTrackCount("audio")
    qtd = len(faixas_sfx(timeline)) + 1
    timeline.SetTrackName("audio", n, FAIXA_SFX if qtd == 1 else "%s %d" % (FAIXA_SFX, qtd))
    return n


def ler_uids_sons(item):
    try:
        bruto = item.GetFusionCompByIndex(1).GetData(CHAVE_SONS)
        return json.loads(bruto) if bruto else []
    except Exception:
        return []


def aplicar_sons(projeto, timeline, pares):
    """pares = [(item_do_texto, [{"arquivo", "frame"}], volume_db)].
    Apaga os sons antigos desses textos e insere os novos. Devolve lista de avisos."""
    avisos = []
    if not pares:
        return avisos
    fps, _, _ = info_fps(timeline)
    media_pool = projeto.GetMediaPool()

    # 1. Apaga os sons que esses textos já tinham
    antigos = set()
    for item, _, _ in pares:
        antigos.update(ler_uids_sons(item))
    if antigos:
        apagar = []
        for faixa in range(1, timeline.GetTrackCount("audio") + 1):
            for a in timeline.GetItemListInTrack("audio", faixa) or []:
                if a.GetUniqueId() in antigos:
                    apagar.append(a)
        if apagar:
            timeline.DeleteClips(apagar, False)

    # 2. Importa os arquivos necessários
    caminhos = sorted({s["arquivo"] for _, sons, _ in pares for s in sons})
    if not caminhos:
        for item, _, _ in pares:
            item.GetFusionCompByIndex(1).SetData(CHAVE_SONS, "[]")
        return avisos
    mpis = itens_de_som(media_pool, caminhos)
    duracoes = {c: duracao_em_frames(c, mpis[c], fps) for c in caminhos if c in mpis}
    for c in caminhos:
        if c not in mpis:
            avisos.append("Som não importado: %s" % c)

    # 3. Distribui nas faixas SFX sem sobreposição (controle em memória)
    ocupado = {}
    for faixa in faixas_sfx(timeline):
        ocupado[faixa] = [(a.GetStart(), a.GetEnd()) for a in timeline.GetItemListInTrack("audio", faixa) or []]

    def faixa_livre(ini, fim):
        for faixa, intervalos in ocupado.items():
            if all(fim <= a or ini >= b for a, b in intervalos):
                return faixa
        faixa = nova_faixa_sfx(timeline)
        ocupado[faixa] = []
        return faixa

    inicio_tl = timeline.GetStartFrame()
    pedidos = []   # (indice_do_par, clipInfo)
    for idx, (item, sons, _) in enumerate(pares):
        for s in sons:
            if s["arquivo"] not in mpis:
                continue
            dur = duracoes[s["arquivo"]]
            ini = max(inicio_tl, int(item.GetStart()) + int(round(s["frame"])))
            faixa = faixa_livre(ini, ini + dur)
            ocupado[faixa].append((ini, ini + dur))
            pedidos.append((idx, {"mediaPoolItem": mpis[s["arquivo"]], "startFrame": 0, "endFrame": dur,
                                  "mediaType": 2, "trackIndex": faixa, "recordFrame": ini}))

    # 4. Insere tudo de uma vez e associa cada clipe de som ao seu texto
    novos = {}
    if pedidos:
        criados = media_pool.AppendToTimeline([p[1] for p in pedidos]) or []
        por_posicao = {(c.GetTrackTypeAndIndex()[1], int(c.GetStart())): c for c in criados}
        for idx, info in pedidos:
            clipe = por_posicao.get((info["trackIndex"], int(info["recordFrame"])))
            if clipe:
                novos.setdefault(idx, []).append(clipe)
        if len(criados) < len(pedidos):
            avisos.append("%d de %d sons não foram inseridos." % (len(pedidos) - len(criados), len(pedidos)))

    for idx, (item, _, volume) in enumerate(pares):
        clipes = novos.get(idx, [])
        for c in clipes:
            c.SetProperty("AudioVolume", float(volume))
        if clipes:
            timeline.SetClipsLinked([item] + clipes, True)
        item.GetFusionCompByIndex(1).SetData(CHAVE_SONS, json.dumps([c.GetUniqueId() for c in clipes]))
    return avisos


# ---------------------------------------------------------------------------
# Fusion Titles (templates arrastáveis da Biblioteca de Efeitos)
# ---------------------------------------------------------------------------
#
# Cada template vira um arquivo .setting em .../Fusion/Templates/Edit/Titles/DaVinci Textos Virais/,
# que o Resolve mostra em Effects Library > Titles > Fusion Titles. Dali é só ARRASTAR para a
# timeline. Como é montado:
#   1. numa timeline temporária, monta a composição igual à do plugin (Text+, keyframes...);
#   2. acrescenta um TimeStretcher cuja expressão mantém a SAÍDA sempre no fim do clipe,
#      qualquer que seja a duração que você der ao título na timeline;
#   3. junta tudo num macro com Texto, Fonte, Estilo e Cor expostos no Inspector;
#   4. grava o .setting (e o ícone .png, se veio da interface).
# O macro guarda os parâmetros (CustomData); "Atualizar selecionado" no plugin reconstrói o
# título com o texto e a duração reais (útil nos estilos palavra por palavra).

def expressao_tempo(saida):
    """SourceTime do TimeStretcher. No título, a saída fica logo depois da entrada:
         [0 .. ini-1] entrada + repouso   |   [ini .. ini+N-1] saída
    No clipe: toca a entrada, segura o último quadro de repouso (ini-1) e, nos últimos N frames
    do clipe, toca a saída. Nunca pede um frame além do fim do clipe (o Fusion não calcula fora
    do intervalo da composição)."""
    n = int(saida.get("frames") or 0)
    ini = int(saida.get("inicio") or 1)
    if n <= 0:
        return "min(time, comp.RenderEnd)"
    return ("min(comp.RenderEnd, iif(time >= comp.RenderEnd + 1 - %d, %d + time - (comp.RenderEnd + 1 - %d), min(time, %d)))"
            % (n, ini, n, ini - 1))


def nome_arquivo(nome):
    limpo = re.sub(r'[\\/:*?"<>|]+', "", nome).strip()
    return limpo or "Template"


def montar_macro_titulo(comp, spec, duracao, formato, nome):
    """Transforma a composição já configurada num macro de Fusion Title (texto .setting)."""
    largura, altura = formato
    # Text+ com a resolução embutida: o título sai certo mesmo numa timeline vertical
    for tool in (comp.GetToolList(False) or {}).values():
        if tool.GetAttrs().get("TOOLS_RegID") == "TextPlus":
            tool.SetInput("UseFrameFormatSettings", 0)
            tool.SetInput("Width", largura)
            tool.SetInput("Height", altura)
            if "Destaque" in tool.Name:
                # camadas de destaque seguem o texto/fonte da camada a que pertencem
                pai = tool.Name.split("Destaque")[0]
                tool.StyledText.SetExpression(pai + ".StyledText")
                tool.Font.SetExpression(pai + ".Font")
                tool.Style.SetExpression(pai + ".Style")
    # barras de riscado/sublinhado seguem o texto da camada indicada
    camadas = spec.get("camadas") or []
    nome_camada = lambda n: PREFIXO + "Texto" + ("" if n == 0 else str(n + 1))
    for n, camada in enumerate(camadas):
        if camada.get("segue") is not None:
            barra = comp.FindTool(nome_camada(n))
            if barra:
                barra.StyledText.SetExpression(nome_camada(int(camada["segue"])) + ".StyledText")

    saida = comp.FindToolByID("MediaOut") or comp.FindTool("MediaOut1")
    ultimo = saida.Input.GetConnectedOutput().GetTool()
    # Transform geral: "Posição" e "Escala" do título inteiro no Inspector
    geral = comp.Transform()
    geral.SetAttrs({"TOOLS_Name": PREFIXO + "Geral"})
    geral.Input = ultimo.Output
    tempo = comp.TimeStretcher()
    tempo.SetAttrs({"TOOLS_Name": PREFIXO + "Tempo"})
    tempo.Input = geral.Output
    tempo.SourceTime.ConnectTo(None)   # o TimeStretcher nasce com uma spline no tempo; usamos expressão
    tempo.SourceTime.SetExpression(expressao_tempo(spec.get("saida") or {}))

    ferramentas = OrderedDict()
    ferramentas["__flags"] = 3145984   # = ordered() no arquivo
    for tool in (comp.GetToolList(False) or {}).values():
        if tool.GetAttrs().get("TOOLS_RegID") in ("MediaOut", "MediaIn"):
            continue
        conf = tool.SaveSettings() or {}
        for chave, valor in (conf.get("Tools") or {}).items():
            if chave != "__flags":
                ferramentas[chave] = valor

    def exposto(n, origem, entrada, rotulo, padrao=None, grupo=None):
        d = {"__ctor": "InstanceInput", "SourceOp": origem, "Source": entrada, "Name": rotulo}
        if padrao is not None:
            d["Default"] = padrao
        if grupo:
            d["ControlGroup"] = grupo
        return ("Input%d" % n, d)

    r, g, b = spec.get("cor", [1, 1, 1])
    texto = PREFIXO + "Texto"
    # Inspector: Posição/Escala gerais e, para cada linha, Texto, Fonte, Estilo e Cor
    # (mesma estrutura dos pacotes de títulos profissionais; ControlGroup junta os pares)
    itens = [exposto(1, PREFIXO + "Geral", "Center", "Posição geral"),
             exposto(2, PREFIXO + "Geral", "Size", "Escala geral", 1)]
    grupo = [10]

    def linha(nome_tool, rotulo, cam):
        cr, cg, cb = cam.get("cor", [1, 1, 1])
        n = len(itens) + 1
        grupo[0] += 2
        itens.extend([
            exposto(n, nome_tool, "StyledText", rotulo, cam.get("texto", "")),
            exposto(n + 1, nome_tool, "Font", rotulo + " · fonte", None, grupo[0]),
            exposto(n + 2, nome_tool, "Style", "Estilo", None, grupo[0]),
            exposto(n + 3, nome_tool, "Red1", rotulo + " · cor", cr, grupo[0] + 1),
            exposto(n + 4, nome_tool, "Green1", "Verde", cg, grupo[0] + 1),
            exposto(n + 5, nome_tool, "Blue1", "Azul", cb, grupo[0] + 1),
        ])

    if camadas:
        k = 0
        for n, camada in enumerate(camadas):
            if camada.get("segue") is None:
                k += 1
                linha(nome_camada(n), "Linha %d" % k, camada)
    else:
        linha(texto, "Texto", spec)
    entradas = OrderedDict([("__flags", 3145984)] + itens)
    dados = {"versao": 1, "nome": nome, "duracao": int(duracao), "formato": [largura, altura],
             "params": spec.get("params") or {}}
    macro = OrderedDict([
        ("__ctor", "MacroOperator"),
        ("CtrlWZoom", False),
        ("NameSet", True),
        ("CustomData", {CHAVE_TITULO: json.dumps(dados, ensure_ascii=False)}),
        ("Inputs", entradas),
        ("Outputs", {"MainOutput1": {"__ctor": "InstanceOutput", "SourceOp": PREFIXO + "Tempo", "Source": "Output"}}),
        ("ViewInfo", {"__ctor": "GroupInfo", "Pos": {1: 0, 2: 0}}),
        ("Tools", ferramentas),
    ])
    nome_macro = "NettoMelloMotions_" + re.sub(r"[^A-Za-z0-9]", "", nome)[:40]
    raiz = {"Tools": OrderedDict([("__flags", 3145984), (nome_macro, macro)])}
    return DVR.writestring(raiz)


def cmd_exportar_titulos(resolve, dados):
    """dados = {"pasta", "formato": [w, h], "titulos": [{"nome", "duracao", "spec", "icone"?}]}"""
    import base64
    projeto = resolve.GetProjectManager().GetCurrentProject()
    if not projeto:
        raise RuntimeError("Abra um projeto no Resolve.")
    media_pool = projeto.GetMediaPool()
    tl_atual = projeto.GetCurrentTimeline()
    pasta_mp = media_pool.GetCurrentFolder()
    pasta = dados["pasta"]
    os.makedirs(pasta, exist_ok=True)
    formato = tuple(int(v) for v in dados.get("formato") or (1920, 1080))

    temporaria = media_pool.CreateEmptyTimeline("DaVinci Textos Virais - temp %d" % int(time.time()))
    if not temporaria:
        raise RuntimeError("Não foi possível criar a timeline temporária.")
    gerados, erros = [], []
    try:
        projeto.SetCurrentTimeline(temporaria)
        for titulo in dados.get("titulos") or []:
            nome = titulo["nome"]
            try:
                item, _, _ = inserir_composicao(temporaria, titulo["duracao"])
                configurar_composicao(item, titulo["spec"], formato)
                texto = montar_macro_titulo(item.GetFusionCompByIndex(1), titulo["spec"], titulo["duracao"], formato, nome)
                base = os.path.join(pasta, nome_arquivo(nome))
                with open(base + ".setting", "w", encoding="utf-8") as f:
                    f.write(texto)
                if titulo.get("icone"):
                    with open(base + ".png", "wb") as f:
                        f.write(base64.b64decode(titulo["icone"]))
                gerados.append(nome)
            except Exception as e:
                log(traceback.format_exc())
                erros.append("%s: %s" % (nome, e))
    finally:
        if tl_atual:
            projeto.SetCurrentTimeline(tl_atual)
        media_pool.DeleteTimelines([temporaria])
        if pasta_mp:
            media_pool.SetCurrentFolder(pasta_mp)
    return {"gerados": gerados, "erros": erros, "pasta": pasta}


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------

def cmd_fontes(resolve, _):
    fontes = resolve.Fusion().FontManager.GetFontList() or {}
    return {"fontes": {nome: sorted(list((estilos or {}).keys())) for nome, estilos in fontes.items()}}


def tc_para_frames(tc, timeline):
    """Converte 'HH:MM:SS:FF' (ou ';' em drop frame) em frame absoluto da timeline."""
    _, base, df = info_fps(timeline)
    h, m, s, f = [int(x) for x in tc.replace(";", ":").split(":")]
    total = ((h * 60 + m) * 60 + s) * base + f
    if df and base in (30, 60):
        drop = 2 if base == 30 else 4
        minutos = h * 60 + m
        total -= drop * (minutos - minutos // 10)
    return total


def cmd_timeline(resolve, _):
    _, tl = obter_timeline(resolve)
    fps, base, df = info_fps(tl)
    return {
        "nome": tl.GetName(), "fps": fps, "fpsBase": base, "dropFrame": df,
        "largura": int(tl.GetSetting("timelineResolutionWidth") or 1920),
        "altura": int(tl.GetSetting("timelineResolutionHeight") or 1080),
        "inicio": tl.GetStartFrame(), "fim": tl.GetEndFrame(),
        "playhead": tl.GetCurrentTimecode(), "faixasVideo": tl.GetTrackCount("video"),
    }


def cmd_selecionados(resolve, _):
    _, tl = obter_timeline(resolve)
    itens = tl.GetSelectedClips() or []
    return {"itens": [descrever_item(i) for i in itens if i.GetTrackTypeAndIndex()[0] == "video"]}


def cmd_info_clipe(resolve, _):
    """Descobre o arquivo de mídia a transcrever e como mapear o tempo dele na timeline."""
    _, tl = obter_timeline(resolve)
    fps_tl, _, _ = info_fps(tl)
    candidatos = [i for i in (tl.GetSelectedClips() or []) if i.GetMediaPoolItem()]
    if not candidatos:
        # Sem seleção: clipe de vídeo ou de áudio sob o playhead
        frame = tc_para_frames(tl.GetCurrentTimecode(), tl)
        for tipo in ("video", "audio"):
            for faixa in range(1, tl.GetTrackCount(tipo) + 1):
                for i in tl.GetItemListInTrack(tipo, faixa) or []:
                    if i.GetStart() <= frame < i.GetEnd() and i.GetMediaPoolItem() and dados_do_item(i) is None:
                        candidatos.append(i)
            if candidatos:
                break
    if not candidatos:
        # Playhead fora de qualquer clipe: se a timeline só tem um arquivo de mídia, usa ele
        todos = {}
        for tipo in ("video", "audio"):
            for faixa in range(1, tl.GetTrackCount(tipo) + 1):
                for i in tl.GetItemListInTrack(tipo, faixa) or []:
                    mpi = i.GetMediaPoolItem()
                    if mpi and mpi.GetClipProperty("File Path") and dados_do_item(i) is None:
                        todos.setdefault(mpi.GetClipProperty("File Path"), i)
        if len(todos) == 1:
            candidatos = list(todos.values())
    if not candidatos:
        raise RuntimeError("Selecione na timeline o clipe (vídeo ou áudio) que deve ser transcrito, "
                           "ou coloque o playhead sobre ele.")
    item = candidatos[0]
    mpi = item.GetMediaPoolItem()
    caminho = mpi.GetClipProperty("File Path")
    if not caminho:
        raise RuntimeError("O clipe selecionado não tem arquivo de mídia (é um gerador/título?).")
    try:
        fps_clipe = float(mpi.GetClipProperty("FPS") or fps_tl)
    except ValueError:
        fps_clipe = fps_tl
    if fps_clipe <= 0:
        fps_clipe = fps_tl
    return {
        "arquivo": caminho,
        "nome": item.GetName(),
        "inicioTimeline": item.GetStart(),       # frame da timeline onde o clipe começa
        "fimTimeline": item.GetEnd(),
        "fonteInicio": item.GetSourceStartFrame() / fps_clipe,  # segundos dentro do arquivo
        "fonteFim": item.GetSourceEndFrame() / fps_clipe,
        "fpsTimeline": fps_tl,
    }


def cmd_quadro(resolve, dados):
    """Exporta o quadro da timeline sob o playhead, SEM as legendas do plugin, para servir de
    fundo na tela de preview. Usa a imagem final da timeline (com o enquadramento real, ex.:
    vertical) e desliga por um instante as faixas que só têm textos do plugin.
    Devolve a imagem JPEG em base64."""
    _, tl = obter_timeline(resolve)
    frame = tc_para_frames(tl.GetCurrentTimecode(), tl)
    # playhead no fim (ou fora) da timeline: usa o último frame válido
    frame = max(tl.GetStartFrame(), min(frame, tl.GetEndFrame() - 1))
    tamanho = int(dados.get("tamanho", 960))
    opcoes = {"outputType": "encodedString", "encodedImageFormat": "jpg", "maxDimension": tamanho, "quality": 80}

    # Faixas ligadas que só contêm textos do plugin (desligadas durante a exportação)
    desligar = []
    for faixa in range(1, tl.GetTrackCount("video") + 1):
        itens = tl.GetItemListInTrack("video", faixa) or []
        if itens and tl.GetIsTrackEnabled("video", faixa) and all(dados_do_item(i) is not None for i in itens):
            desligar.append(faixa)
    try:
        for faixa in desligar:
            tl.SetTrackEnable("video", faixa, False)
        r = tl.ExportFrame(int(frame - tl.GetStartFrame()), opcoes) or {}
    finally:
        for faixa in desligar:
            tl.SetTrackEnable("video", faixa, True)
    if not r.get("success"):
        raise RuntimeError(r.get("error") or "Não foi possível exportar o quadro da timeline.")
    return {"imagem": r["data"], "largura": r.get("width"), "altura": r.get("height")}


def cmd_aplicar(resolve, dados):
    """dados = {"jobs": [{"uid"?, "frame", "duracao", "faixa"?, "spec"}], "manterPosicao"?}
    - com uid: usa o clipe existente (inserido pelo JavaScript ou selecionado para atualizar);
    - sem uid: insere a composição aqui mesmo (caminho alternativo ao JavaScript)."""
    projeto, tl = obter_timeline(resolve)
    playhead_original = tl.GetCurrentTimecode()
    jobs = dados.get("jobs") or []
    pares_som = []   # (item, sons, volume) dos textos configurados com sucesso
    formato = resolucao_timeline(tl)
    manter = bool(dados.get("manterPosicao"))
    resultados, avisos = [], []

    # Faixa única para o lote todo (as frases de uma transcrição ficam na mesma faixa)
    faixa_lote = dados.get("faixa")
    uids_lote = {j["uid"] for j in jobs if j.get("uid")}
    if not manter and not faixa_lote:
        intervalos = [(int(j["frame"]), int(j["frame"]) + int(j["duracao"])) for j in jobs]
        faixa_lote = escolher_faixa(tl, intervalos, ignorar=uids_lote)
    if faixa_lote:
        garantir_faixa(tl, int(faixa_lote))

    try:
        for job in jobs:
            try:
                item = achar_por_uid(tl, job["uid"]) if job.get("uid") else None
                if not item and job.get("uid"):
                    raise RuntimeError("Clipe %s não encontrado na timeline." % job["uid"])
                if not item:
                    item, _, aviso = inserir_composicao(tl, job["duracao"])
                    if aviso:
                        avisos.append(aviso)
                if not manter:
                    pos = item.GetPosition()
                    if pos.get("trackIndex") != int(faixa_lote) or int(pos.get("startFrame", -1)) != int(job["frame"]):
                        posicionar(item, faixa_lote, job["frame"])
                configurar_composicao(item, job["spec"], formato)
                if "sons" in job["spec"]:
                    pares_som.append((item, job["spec"]["sons"], job["spec"].get("volumeSom", -8)))
                resultados.append({"ok": True, "uid": item.GetUniqueId(), "faixa": item.GetTrackTypeAndIndex()[1],
                                   "inicio": item.GetStart(), "fim": item.GetEnd()})
            except Exception as e:  # um job com erro não interrompe o lote
                log(traceback.format_exc())
                resultados.append({"ok": False, "erro": str(e), "uid": job.get("uid")})
        # Efeitos sonoros de todos os textos de uma vez (mais rápido em lotes grandes)
        try:
            avisos.extend(aplicar_sons(projeto, tl, pares_som))
        except Exception as e:
            log(traceback.format_exc())
            avisos.append("Sons não inseridos: %s" % e)
    finally:
        tl.SetCurrentTimecode(playhead_original)

    return {"resultados": resultados, "avisos": sorted(set(avisos))}


COMANDOS = {
    "fontes": cmd_fontes,
    "timeline": cmd_timeline,
    "selecionados": cmd_selecionados,
    "info-clipe": cmd_info_clipe,
    "quadro": cmd_quadro,
    "exportar-titulos": cmd_exportar_titulos,
    "aplicar": cmd_aplicar,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMANDOS:
        responder({"ok": False, "erro": "Uso: legendas_fusion.py <%s> [arquivo.json]" % "|".join(COMANDOS)})
        return
    dados = {}
    if len(sys.argv) >= 3:
        with open(sys.argv[2], "r", encoding="utf-8") as f:
            dados = json.load(f)
    try:
        resolve = conectar()
        resposta = COMANDOS[sys.argv[1]](resolve, dados)
        resposta["ok"] = True
        responder(resposta)
    except Exception as e:
        log(traceback.format_exc())
        responder({"ok": False, "erro": str(e)})


if __name__ == "__main__":
    main()
