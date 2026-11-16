#!/bin/bash
# DaVinci Textos Virais - instala o faster-whisper num ambiente virtual próprio.
# O Python embutido do Resolve não tem pip, por isso a transcrição usa um venv separado em:
#   ~/Library/Application Support/EditorDeLegendas/venv
set -e
PASTA="$HOME/Library/Application Support/EditorDeLegendas"
VENV="$PASTA/venv"
mkdir -p "$PASTA"

if command -v uv >/dev/null 2>&1; then
    # uv baixa um Python 3.11 se for preciso (recomendado)
    uv venv --python 3.11 "$VENV"
    uv pip install --python "$VENV/bin/python" faster-whisper
else
    # Sem uv: usa o python3 do sistema (precisa ser 3.9 ou mais novo)
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --upgrade pip
    "$VENV/bin/pip" install faster-whisper
fi

"$VENV/bin/python" -c "import faster_whisper; print('faster-whisper', faster_whisper.__version__, 'instalado em', '$VENV')"
