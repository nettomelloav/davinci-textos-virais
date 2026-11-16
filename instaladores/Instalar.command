#!/bin/bash
# =============================================================================
# DaVinci Textos Virais - instalador para macOS
# Desenvolvido por Netto Mello Videomaker
#
# Copia o plugin para a pasta de plugins do DaVinci Resolve. O arquivo
# WorkflowIntegration.node (da Blackmagic) é copiado da SUA instalação do Resolve,
# então ele sempre corresponde à versão que você tem.
# =============================================================================
cd "$(dirname "$0")" || exit 1
ORIGEM="$PWD/plugin/com.netto.editordelegendas"
RESOLVE="/Library/Application Support/Blackmagic Design/DaVinci Resolve"
DESTINO="${DESTINO_TESTE:-$RESOLVE/Workflow Integration Plugins/com.netto.editordelegendas}"
SUDO="${SUDO-sudo}"   # (para testes: SUDO="" DESTINO_TESTE=/alguma/pasta)
NODE="$RESOLVE/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"

echo ""
echo "  ▶  DaVinci Textos Virais — instalador"
echo "     Desenvolvido por Netto Mello Videomaker"
echo ""

if [ ! -d "$RESOLVE" ]; then
    echo "✖ DaVinci Resolve não encontrado em: $RESOLVE"
    echo "  Instale o DaVinci Resolve Studio 21.1 ou mais novo e rode este instalador de novo."
    read -r -p "Enter para fechar"; exit 1
fi
if [ ! -f "$NODE" ]; then
    echo "✖ Não encontrei o arquivo da Blackmagic WorkflowIntegration.node em:"
    echo "  $NODE"
    echo "  Ele vem com o DaVinci Resolve Studio (pasta Developer). Atualize/reinstale o Resolve Studio."
    read -r -p "Enter para fechar"; exit 1
fi

echo "Vou copiar o plugin para a pasta de plugins do Resolve."
echo "O macOS vai pedir a sua senha de administrador (digite e tecle Enter; ela não aparece na tela)."
echo ""
instalar() {
    $SUDO mkdir -p "$DESTINO" &&
    $SUDO rsync -a --delete --exclude '._*' --exclude '.DS_Store' "$ORIGEM/" "$DESTINO/" &&
    $SUDO cp "$NODE" "$DESTINO/" &&
    { $SUDO xattr -dr com.apple.quarantine "$DESTINO" 2>/dev/null; true; } &&
    { [ -z "$SUDO" ] || $SUDO chown -R root:wheel "$DESTINO"; } &&
    $SUDO chmod -R a+rX "$DESTINO"
}
if ! instalar; then
    echo "✖ Não foi possível instalar (senha incorreta ou sem permissão)."
    read -r -p "Enter para fechar"; exit 1
fi
echo "✔ Plugin instalado em: $DESTINO"
echo ""

read -r -p "Instalar também a transcrição automática (faster-whisper, ~300 MB)? [s/N] " RESP
if [[ "$RESP" =~ ^[sS] ]]; then
    bash "$DESTINO/instalar_whisper.sh" || echo "⚠ A transcrição não foi instalada; o resto do plugin funciona normalmente."
fi

echo ""
echo "Pronto! Agora:"
echo "  1. No DaVinci Resolve: Preferências › Sistema › Geral › 'External scripting using' = Local"
echo "  2. Reinicie o DaVinci Resolve"
echo "  3. Abra: Workspace › Workflow Integrations › DaVinci Textos Virais"
echo ""
read -r -p "Enter para fechar"
