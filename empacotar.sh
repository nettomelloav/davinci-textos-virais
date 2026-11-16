#!/bin/bash
# Gera o pacote de distribuição (.zip) do DaVinci Textos Virais.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$AQUI/../com.netto.editordelegendas"
VERSAO=$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$PLUGIN/manifest.xml")
TMP="$(mktemp -d)"
PASTA="$TMP/DaVinci Textos Virais"
mkdir -p "$PASTA/plugin/com.netto.editordelegendas"
# WorkflowIntegration.node NÃO vai no pacote: o instalador copia da instalação do Resolve do usuário
rsync -a --exclude '._*' --exclude '.DS_Store' --exclude '__pycache__' --exclude 'WorkflowIntegration.node' \
      "$PLUGIN/" "$PASTA/plugin/com.netto.editordelegendas/"
cp "$AQUI/instaladores/Instalar.command" "$AQUI/instaladores/Instalar-Windows.bat" "$AQUI/instaladores/LEIA-ME.txt" "$PASTA/"
chmod +x "$PASTA/Instalar.command" "$PASTA/plugin/com.netto.editordelegendas/"*.sh
mkdir -p "$AQUI/dist"
rm -f "$AQUI/dist/DaVinci-Textos-Virais.zip"
(cd "$TMP" && COPYFILE_DISABLE=1 zip -qry "$AQUI/dist/DaVinci-Textos-Virais.zip" "DaVinci Textos Virais" -x '*/._*' '*.DS_Store')
rm -rf "$TMP"
echo "$VERSAO" > "$AQUI/dist/VERSAO.txt"
ls -la "$AQUI/dist"
echo "Versão $VERSAO"
