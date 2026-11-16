# DaVinci Textos Virais

Plugin **gratuito** para DaVinci Resolve Studio: textos animados estilo Reels direto na timeline.

**Página oficial e download:** https://nettomelloav.github.io/davinci-textos-virais/

- 29 templates (14 legendas + 15 letterings com várias camadas)
- Animações de entrada e saída, contorno, sombra, brilho e caixa de fundo
- 11 efeitos sonoros próprios, sincronizados e vinculados ao texto
- Transcrição automática (faster-whisper): legendas por frase ou por palavra
- Preview ao vivo com edição pelo mouse
- Templates como Fusion Titles para arrastar da Biblioteca de Efeitos
- Pronto para timelines verticais (9:16)

## Instalar

Baixe o `DaVinci-Textos-Virais.zip` em [Releases](https://github.com/nettomelloav/davinci-textos-virais/releases/latest)
e siga o `LEIA-ME.txt` (macOS: dois cliques em `Instalar.command`).

Requisitos: DaVinci Resolve **Studio** 21.1+ · macOS (testado) · Windows (beta).

## Estrutura deste repositório

- `plugin/` — código do plugin (Workflow Integration: Electron + Python/Fusion)
- `instaladores/` — instaladores e LEIA-ME que vão no zip
- `docs/` — página oficial (GitHub Pages)

O arquivo `WorkflowIntegration.node` é da Blackmagic Design e não é distribuído aqui:
o instalador copia o da instalação do DaVinci Resolve do usuário.

DaVinci Resolve é marca da Blackmagic Design. Projeto independente, sem vínculo com a Blackmagic.

---

Desenvolvido por **Netto Mello Videomaker**.
