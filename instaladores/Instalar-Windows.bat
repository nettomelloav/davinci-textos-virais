@echo off
chcp 65001 >nul
rem ============================================================================
rem DaVinci Textos Virais - instalador para Windows (EXPERIMENTAL)
rem Desenvolvido por Netto Mello Videomaker
rem Clique com o botao direito > "Executar como administrador".
rem ============================================================================
set "RES=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support"
set "DEST=%RES%\Workflow Integration Plugins\com.netto.editordelegendas"
set "NODE=%RES%\Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node"

echo.
echo   DaVinci Textos Virais - instalador (Windows, experimental)
echo.
net session >nul 2>&1
if errorlevel 1 (
  echo Execute este arquivo como ADMINISTRADOR ^(botao direito ^> Executar como administrador^).
  pause & exit /b 1
)
if not exist "%NODE%" (
  echo Nao encontrei o WorkflowIntegration.node do DaVinci Resolve Studio em:
  echo %NODE%
  pause & exit /b 1
)
robocopy "%~dp0plugin\com.netto.editordelegendas" "%DEST%" /MIR /NFL /NDL /NJH /NJS >nul
copy /Y "%NODE%" "%DEST%\" >nul
echo Plugin instalado em: %DEST%
echo.
echo Agora: Preferencias ^> Sistema ^> Geral ^> External scripting using = Local,
echo reinicie o DaVinci Resolve e abra Workspace ^> Workflow Integrations ^> DaVinci Textos Virais.
echo Transcricao automatica no Windows: veja o LEIA-ME.txt.
echo.
pause
