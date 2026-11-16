#!/bin/bash
# DaVinci Textos Virais - copia o plugin para a pasta de plugins do Resolve (macOS).
# A pasta pertence ao root, então este script precisa de sudo:
#   sudo ./instalar_plugin.sh
set -e
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DESTINO="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.netto.editordelegendas"
mkdir -p "$DESTINO"
# --exclude '._*' evita os arquivos de metadados que o macOS cria em discos exFAT
rsync -a --delete --exclude '._*' --exclude '.DS_Store' --exclude '__pycache__' "$ORIGEM/" "$DESTINO/"
chown -R root:wheel "$DESTINO"
chmod -R a+rX "$DESTINO"
echo "Plugin instalado em: $DESTINO"
echo "Reinicie o DaVinci Resolve e abra Workspace > Workflow Integrations > DaVinci Textos Virais."
