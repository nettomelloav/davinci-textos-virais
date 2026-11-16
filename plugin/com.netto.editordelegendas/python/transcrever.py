# -*- coding: utf-8 -*-
"""
DaVinci Textos Virais - transcrição automática com faster-whisper.

Roda no Python do ambiente virtual criado por instalar_whisper.sh (o Python embutido do
Resolve não tem pip). Não fala com o Resolve: só lê o arquivo de áudio/vídeo e devolve
os tempos das palavras em JSON no stdout. O progresso vai para o stderr.

Uso:
  python transcrever.py --arquivo VIDEO.mov [--inicio 12.5 --fim 40] [--modelo small]
                        [--idioma pt] [--dispositivo auto]

Saída:
  {"ok": true, "idioma": "pt",
   "palavras":  [{"texto": "Olá", "inicio": 12.61, "fim": 12.9}, ...],
   "segmentos": [{"texto": "Olá pessoal", "inicio": 12.61, "fim": 13.8,
                  "palavras": [índices na lista de palavras]}, ...]}
  Os tempos são em segundos, contados desde o início do ARQUIVO.
"""

import argparse
import json
import sys


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arquivo", required=True)
    ap.add_argument("--inicio", type=float, default=None, help="segundo inicial dentro do arquivo")
    ap.add_argument("--fim", type=float, default=None, help="segundo final dentro do arquivo")
    ap.add_argument("--modelo", default="small", help="tiny, base, small, medium, large-v3, turbo...")
    ap.add_argument("--idioma", default="pt", help="código do idioma ou 'auto'")
    ap.add_argument("--dispositivo", default="auto")
    a = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"ok": False, "erro": "faster-whisper não instalado. Rode instalar_whisper.sh."}))
        return

    try:
        log("PROGRESSO 0 Carregando modelo '%s' (a primeira vez baixa o modelo da internet)..." % a.modelo)
        # int8 roda bem em CPU (inclusive Apple Silicon); CUDA usa float16 automaticamente
        modelo = WhisperModel(a.modelo, device=a.dispositivo, compute_type="default" if a.dispositivo == "cuda" else "int8")

        opcoes = dict(
            word_timestamps=True,      # tempo de cada palavra (essencial para legenda animada)
            vad_filter=True,           # ignora trechos sem fala
            beam_size=5,
        )
        if a.idioma and a.idioma != "auto":
            opcoes["language"] = a.idioma
        if a.inicio is not None or a.fim is not None:
            # Transcreve só o trecho do arquivo que está usado na timeline
            ini = max(0.0, a.inicio or 0.0)
            opcoes["clip_timestamps"] = [ini, a.fim] if a.fim else [ini]

        segmentos_iter, info = modelo.transcribe(a.arquivo, **opcoes)
        duracao = info.duration or 1.0
        log("PROGRESSO 5 Idioma: %s. Transcrevendo..." % info.language)

        palavras, segmentos = [], []
        for seg in segmentos_iter:
            indices = []
            for w in seg.words or []:
                txt = w.word.strip()
                if not txt:
                    continue
                if a.inicio is not None and w.end < a.inicio:
                    continue
                if a.fim is not None and w.start > a.fim:
                    continue
                indices.append(len(palavras))
                palavras.append({"texto": txt, "inicio": round(w.start, 3), "fim": round(w.end, 3)})
            if indices:
                segmentos.append({
                    "texto": " ".join(palavras[i]["texto"] for i in indices),
                    "inicio": palavras[indices[0]]["inicio"],
                    "fim": palavras[indices[-1]]["fim"],
                    "palavras": indices,
                })
            pct = int(5 + 95 * min(1.0, seg.end / duracao))
            log("PROGRESSO %d %s" % (pct, seg.text.strip()[:60]))

        print(json.dumps({"ok": True, "idioma": info.language, "palavras": palavras, "segmentos": segmentos},
                         ensure_ascii=False))
    except Exception as e:
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"ok": False, "erro": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
