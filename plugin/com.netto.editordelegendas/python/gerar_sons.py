# -*- coding: utf-8 -*-
"""
DaVinci Textos Virais - gerador da biblioteca de efeitos sonoros.

Sintetiza os sons (sem samples de terceiros, então sem problema de direitos autorais)
e grava WAVs estéreo 48 kHz / 16 bits na pasta ../sons. Só usa a biblioteca padrão.

Uso:  python3 gerar_sons.py [pasta_destino]

Para criar um som novo: escreva uma função que devolve uma lista de amostras (-1..1)
e registre em SONS no fim do arquivo. Para usar sons próprios (gravados), coloque
.wav/.mp3/.aif em ~/Library/Application Support/EditorDeLegendas/sons - o plugin lista
esses arquivos automaticamente.
"""

import math
import os
import random
import struct
import sys
import wave

TAXA = 48000


# ---------------------------------------------------------------------------
# Blocos básicos
# ---------------------------------------------------------------------------

def n_amostras(segundos):
    return int(TAXA * segundos)


def envelope(n, ataque, decaimento, curva=4.0):
    """Ataque linear e decaimento exponencial (em segundos)."""
    a = max(1, n_amostras(ataque))
    saida = []
    for i in range(n):
        if i < a:
            saida.append(i / a)
        else:
            t = (i - a) / TAXA
            saida.append(math.exp(-curva * t / max(1e-4, decaimento)))
    return saida


def seno_varrido(segundos, f_ini, f_fim, curva=1.0):
    """Seno com frequência indo de f_ini a f_fim (curva >1 = cai rápido no começo)."""
    n = n_amostras(segundos)
    fase = 0.0
    saida = []
    for i in range(n):
        t = i / max(1, n - 1)
        f = f_fim + (f_ini - f_fim) * (1 - t) ** curva
        fase += 2 * math.pi * f / TAXA
        saida.append(math.sin(fase))
    return saida


def ruido(segundos, semente=1):
    rnd = random.Random(semente)
    return [rnd.uniform(-1, 1) for _ in range(n_amostras(segundos))]


def passa_banda_varrido(sinal, f_ini, f_fim, q=2.0):
    """Filtro passa-banda (biquad) com frequência central variando - dá o "whoosh"."""
    saida = []
    x1 = x2 = y1 = y2 = 0.0
    n = len(sinal)
    for i, x in enumerate(sinal):
        t = i / max(1, n - 1)
        f = f_ini * (f_fim / f_ini) ** t
        w = 2 * math.pi * min(f, TAXA * 0.45) / TAXA
        alfa = math.sin(w) / (2 * q)
        b0, b2 = alfa, -alfa
        a0, a1, a2 = 1 + alfa, -2 * math.cos(w), 1 - alfa
        y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1 = x1, x
        y2, y1 = y1, y
        saida.append(y)
    return saida


def passa_baixa(sinal, corte):
    k = 1 - math.exp(-2 * math.pi * corte / TAXA)
    y = 0.0
    saida = []
    for x in sinal:
        y += k * (x - y)
        saida.append(y)
    return saida


def mult(a, b):
    return [x * y for x, y in zip(a, b)]


def somar(*sinais):
    n = max(len(s) for s in sinais)
    return [sum(s[i] for s in sinais if i < len(s)) for i in range(n)]


def ganho(sinal, g):
    return [x * g for x in sinal]


def normalizar(sinal, pico=0.89):
    m = max(1e-9, max(abs(x) for x in sinal))
    return [x * pico / m for x in sinal]


def fade_final(sinal, segundos=0.01):
    n = min(len(sinal), n_amostras(segundos))
    for i in range(n):
        sinal[-1 - i] *= i / n
    return sinal


# ---------------------------------------------------------------------------
# Sons
# ---------------------------------------------------------------------------

def som_pop():
    """Bolha estourando: seno caindo rápido de tom + estalo curto."""
    corpo = mult(seno_varrido(0.12, 950, 260, curva=3), envelope(n_amostras(0.12), 0.002, 0.05))
    estalo = mult(passa_baixa(ruido(0.012, 7), 6000), envelope(n_amostras(0.012), 0.0005, 0.004))
    return somar(corpo, ganho(estalo, 0.5))


def som_bloop():
    """Bolha subindo (bom para palavras surgindo)."""
    return mult(seno_varrido(0.09, 300, 1100, curva=0.6), envelope(n_amostras(0.09), 0.004, 0.04))


def som_whoosh():
    """Vento passando: ruído com filtro varrendo para cima e para baixo."""
    n = n_amostras(0.55)
    base = ruido(0.55, 3)
    sobe = passa_banda_varrido(base[: n // 2], 300, 2500, q=1.4)
    desce = passa_banda_varrido(base[n // 2:], 2500, 500, q=1.4)
    env = [math.sin(math.pi * i / n) ** 2 for i in range(n)]
    return mult(sobe + desce, env)


def som_swoosh():
    """Swoosh subindo, rápido (bom para texto que sobe)."""
    n = n_amostras(0.35)
    sinal = passa_banda_varrido(ruido(0.35, 5), 400, 5000, q=2.2)
    env = [(i / n) ** 1.5 * math.exp(-3 * max(0, i / n - 0.7)) for i in range(n)]
    return mult(sinal, env)


def som_clique():
    """Tecla de máquina de escrever: estalo agudo + batida grave curta."""
    estalo = mult(passa_banda_varrido(ruido(0.03, 11), 3500, 2500, q=1.2), envelope(n_amostras(0.03), 0.0003, 0.008))
    batida = mult(seno_varrido(0.04, 220, 120, curva=2), envelope(n_amostras(0.04), 0.001, 0.015))
    return somar(estalo, ganho(batida, 0.6))


def som_tique():
    """Tique suave e agudo (destaque palavra por palavra)."""
    return mult(seno_varrido(0.035, 2600, 2200), envelope(n_amostras(0.035), 0.0008, 0.012))


def som_ding():
    """Sininho: parciais inarmônicas com decaimento longo."""
    n = n_amostras(1.3)
    parciais = [(1320, 1.0, 1.0), (2640, 0.5, 0.7), (3960, 0.25, 0.5), (1980 * 1.51, 0.2, 0.4)]
    saida = [0.0] * n
    for f, amp, dec in parciais:
        for i in range(n):
            t = i / TAXA
            saida[i] += amp * math.sin(2 * math.pi * f * t) * math.exp(-t * 3.2 / dec)
    ataque = n_amostras(0.002)
    for i in range(ataque):
        saida[i] *= i / ataque
    return saida


def som_impacto():
    """Batida grave (boom) para títulos de impacto."""
    grave = mult(seno_varrido(0.7, 140, 42, curva=2.5), envelope(n_amostras(0.7), 0.002, 0.28))
    ataque = mult(passa_baixa(ruido(0.08, 13), 1800), envelope(n_amostras(0.08), 0.001, 0.03))
    return somar(grave, ganho(ataque, 0.7))


def som_brilho():
    """Brilhinho: vários blips agudos aleatórios (bom para neon)."""
    rnd = random.Random(21)
    n = n_amostras(0.6)
    saida = [0.0] * n
    for _ in range(14):
        ini = rnd.randint(0, int(n * 0.7))
        f = rnd.uniform(2400, 5200)
        dur = n_amostras(rnd.uniform(0.03, 0.08))
        amp = rnd.uniform(0.3, 0.8) * (1 - ini / n)
        for i in range(dur):
            if ini + i < n:
                saida[ini + i] += amp * math.sin(2 * math.pi * f * i / TAXA) * math.exp(-i / (dur * 0.3))
    return saida


def som_glitch():
    """Glitch digital: rajadas de ruído com bitcrush."""
    rnd = random.Random(33)
    n = n_amostras(0.25)
    saida = [0.0] * n
    pos = 0
    while pos < n:
        dur = n_amostras(rnd.uniform(0.01, 0.04))
        nivel = rnd.choice([0, 0.4, 0.8, 1.0])
        passos = rnd.choice([4, 8, 16])
        f = rnd.uniform(200, 1800)
        for i in range(dur):
            if pos + i >= n:
                break
            v = math.copysign(1, math.sin(2 * math.pi * f * i / TAXA)) * 0.5 + rnd.uniform(-0.5, 0.5)
            saida[pos + i] = round(v * passos) / passos * nivel
        pos += dur
    return fade_final(saida, 0.02)


def som_slide():
    """Deslizar suave e curto (entrada com fade)."""
    n = n_amostras(0.4)
    sinal = passa_banda_varrido(ruido(0.4, 17), 1500, 700, q=0.9)
    env = [math.sin(math.pi * i / n) for i in range(n)]
    return ganho(mult(sinal, env), 0.6)


# id -> (nome na interface, função, antecipar)
# "antecipar" (segundos): quanto o som começa ANTES do movimento. Sons como o whoosh
# têm o pico no meio; antecipando, o pico cai no instante em que o texto aparece.
SONS = {
    "pop": ("Pop", som_pop, 0.0),
    "bloop": ("Bloop (bolha)", som_bloop, 0.0),
    "whoosh": ("Whoosh", som_whoosh, 0.25),
    "swoosh": ("Swoosh subindo", som_swoosh, 0.22),
    "slide": ("Deslizar suave", som_slide, 0.15),
    "clique": ("Clique de teclado", som_clique, 0.0),
    "tique": ("Tique", som_tique, 0.0),
    "ding": ("Ding", som_ding, 0.0),
    "impacto": ("Impacto (boom)", som_impacto, 0.0),
    "brilho": ("Brilho", som_brilho, 0.0),
    "glitch": ("Glitch", som_glitch, 0.0),
}


def gravar_wav(caminho, amostras):
    amostras = fade_final(normalizar(amostras))
    with wave.open(caminho, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        quadros = bytearray()
        for x in amostras:
            v = int(max(-1.0, min(1.0, x)) * 32767)
            quadros += struct.pack("<hh", v, v)
        w.writeframes(bytes(quadros))


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sons")
    os.makedirs(destino, exist_ok=True)
    catalogo = {}
    for sid, (nome, fn, antecipar) in SONS.items():
        caminho = os.path.join(destino, sid + ".wav")
        amostras = fn()
        gravar_wav(caminho, amostras)
        catalogo[sid] = {"nome": nome, "arquivo": sid + ".wav", "antecipar": antecipar,
                         "duracao": round(len(amostras) / TAXA, 4)}
        print("%-8s %-20s %s" % (sid, nome, caminho))
    # Catálogo lido pelo main.js (nomes na interface e antecipação)
    with open(os.path.join(destino, "sons.json"), "w", encoding="utf-8") as f:
        import json
        json.dump(catalogo, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
