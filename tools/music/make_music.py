#!/usr/bin/env python3
"""
"Pelican Express" - an original jolly tune, synthesised from scratch with numpy (no samples, no
existing melody). 48 bars of 4/4 at 128 bpm = exactly 90.0 s, so the closing chord lands the moment the
pelican rolls to a stop. Style: bouncy oom-pah bass and chord stabs, xylophone melody, light drums.

    python3 make_music.py [out.wav] [total_seconds=91]

Form (bars): intro 4 | A 8 | A' 8 | B 8 | A 8 | A' up a tone 8 | outro 4 | final chord.
"""
import sys
import wave
import numpy as np
from scipy.signal import fftconvolve

SR = 44100
BPM = 128
BEAT = 60.0 / BPM
EIGHTH = BEAT / 2
BAR = 4 * BEAT                                   # 1.875 s
OUT = sys.argv[1] if len(sys.argv) > 1 else "pelican-express.wav"
TOTAL_S = float(sys.argv[2]) if len(sys.argv) > 2 else 91.0
rng = np.random.default_rng(7)

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    n = PC[name[0]]
    i = 1
    while name[i] in "#b":
        n += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + n


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def parse(bars):
    """['G4:1 C5:1 ...', ...] -> per bar [(midi or None, length in eighths)]"""
    out = []
    for bar in bars:
        toks = []
        for t in bar.split():
            n, l = t.split(":")
            toks.append((None if n == "R" else midi(n), int(l)))
        assert sum(l for _, l in toks) == 8, bar
        out.append(toks)
    return out


# ------------------------------------------------------------------ the tune (written in C major)
INTRO = parse(["C5:1 E5:1 G5:1 E5:1 C5:1 E5:1 G5:2",
               "F5:1 A5:1 C6:1 A5:1 F5:1 A5:1 C6:2",
               "G5:1 B5:1 D6:1 B5:1 G5:1 B5:1 D6:2",
               "D6:1 C6:1 B5:1 A5:1 G5:2 R:2"])
INTRO_CH = [(0, ""), (5, ""), (7, "7"), (7, "7")]

A = parse(["G4:1 C5:1 E5:1 G5:1 E5:2 C5:1 R:1",
           "D5:1 E5:1 F5:1 E5:1 D5:1 C5:1 D5:2",
           "A4:1 C5:1 F5:1 A5:1 F5:2 C5:1 R:1",
           "B4:1 C5:1 D5:1 E5:1 G5:2 E5:2",
           "D5:1 G5:1 B5:1 G5:1 F5:2 D5:2",
           "E5:1 G5:1 E5:1 C5:1 D5:1 E5:1 C5:2",
           "B4:1 D5:1 F5:1 D5:1 B4:1 D5:1 G4:2",
           "C5:2 E5:2 G5:2 C6:2"])
A_CH = [(0, ""), (0, ""), (5, ""), (0, ""), (7, "7"), (0, ""), (7, "7"), (0, "")]

A2 = parse(["E5:2 E5:1 G5:1 E5:2 C5:2",
            "A4:1 C5:1 E5:1 A5:1 G5:2 E5:2",
            "F5:2 F5:1 A5:1 F5:2 C5:2",
            "D5:1 F5:1 G5:1 B5:1 A5:2 G5:2",
            "G5:1 E5:1 C5:1 E5:1 G5:2 C6:2",
            "A5:1 G5:1 F5:1 E5:1 F5:2 A4:2",
            "G5:1 F5:1 D5:1 B4:1 D5:2 F5:2",
            "C5:2 G4:2 C5:4"])
A2_CH = [(0, ""), (9, "m"), (5, ""), (7, "7"), (0, ""), (5, ""), (7, "7"), (0, "")]

B = parse(["C5:2 F5:2 A5:2 F5:2",
           "D5:2 F5:2 A5:2 D6:2",
           "B5:2 G5:2 D5:2 F5:2",
           "E5:2 G5:2 C6:4",
           "A5:2 F5:1 A5:1 C6:2 A5:2",
           "F5:1 A5:1 D6:2 C6:2 A5:2",
           "B5:1 D6:1 B5:1 G5:1 F5:2 D5:2",
           "C5:1 E5:1 G5:1 E5:1 C5:2 R:2"])
B_CH = [(5, ""), (2, "m"), (7, "7"), (0, ""), (5, ""), (2, "m"), (7, "7"), (0, "")]

# (melody bars, chord bars, transpose in semitones, octave-doubling level, glockenspiel level)
SECTIONS = [
    (INTRO, INTRO_CH, 0, 0.0, 0.0),
    (A, A_CH, 0, 0.0, 0.0),
    (A2, A2_CH, 0, 0.0, 0.25),
    (B, B_CH, 0, 0.0, 0.0),
    (A, A_CH, 0, 0.45, 0.0),                     # second time round the tune is thickened
    (A2, A2_CH, 2, 0.45, 0.35),                  # key change up a tone for the last chorus
    (INTRO, INTRO_CH, 2, 0.45, 0.35),            # outro in the new key
]
assert sum(len(s[0]) for s in SECTIONS) == 48

# ------------------------------------------------------------------ instruments
N = int((TOTAL_S + 4.0) * SR)
L = np.zeros(N)
R = np.zeros(N)


def add(sig, t0, pan=0.0, gain=1.0):
    """mix a mono signal in at time t0; pan -1 (left) .. +1 (right), constant-power"""
    i = int(round(t0 * SR))
    if i >= N:
        return
    n = min(len(sig), N - i)
    a = (pan + 1) * np.pi / 4
    L[i:i + n] += sig[:n] * np.cos(a) * gain
    R[i:i + n] += sig[:n] * np.sin(a) * gain


def env_ar(n, attack=0.003, release=0.02):
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] = np.minimum(e[-r:], np.linspace(1, 0, r))
    return e


def xylo(m, dur=0.9, bright=1.0):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5)
         + 0.42 * bright * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 22)
         + 0.16 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 45))
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.05
    return (s + click) * env_ar(n, 0.001, 0.05)


def glock(m, dur=1.1):
    f = mtof(m + 12)
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 4) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 9)
    return s * env_ar(n, 0.001, 0.08) * 0.6


def bass(m, dur=0.30):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * 2 * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t)
    return s * np.exp(-t * 6.5) * env_ar(n, 0.004, 0.06)


def stab(ms, dur=0.17, sustain=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for m in ms:
        f = mtof(m)
        for det in (-0.004, 0.004):                # two slightly detuned voices = accordion-ish shimmer
            for h in range(1, 7):
                s += np.sin(2 * np.pi * f * (1 + det) * h * t + h) / h
    s *= 1.0 if sustain else np.exp(-t * 11)
    return s / (len(ms) * 2.4) * env_ar(n, 0.006, 0.05)


def kick():
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 15) * env_ar(n, 0.001, 0.02)


def snare():
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    noise = np.diff(rng.standard_normal(n + 1))               # tilt toward highs
    return (noise * 0.5 * np.exp(-t * 26) + np.sin(2 * np.pi * 190 * t) * 0.5 * np.exp(-t * 32)) * env_ar(n, 0.001, 0.02)


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    noise = np.diff(rng.standard_normal(n + 2), 2)                        # second difference = bright hiss
    return noise * np.exp(-t * (18 if open_ else 90)) * 0.5 * env_ar(n, 0.0005, 0.01)


def crash(dur=3.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = np.diff(rng.standard_normal(n + 2), 2)
    return noise * np.exp(-t * 1.9) * 0.6 * env_ar(n, 0.001, 0.2)


def bell(t0):
    """bicycle bell: two quick dings"""
    for k, dt in enumerate((0.0, 0.24)):
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        f = 2350
        s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.42 * t) * np.exp(-t * 6)
             + 0.3 * np.sin(2 * np.pi * f * 3.96 * t) * np.exp(-t * 9)) * np.exp(-t * 5.2)
        add(s * env_ar(n, 0.0008, 0.05), t0 + dt, pan=0.3, gain=0.22)


def triad(root_pc, kind):
    tones = {"": (0, 4, 7), "m": (0, 3, 7), "7": (0, 4, 10)}[kind]         # dominant 7th drops the 5th
    return [(root_pc + x) for x in tones]


def voicing(pcs, tr):
    return [60 + ((pc + tr - 60) % 12) for pc in pcs]


# ------------------------------------------------------------------ sequence it
bar_no = 0
for melody, chords, tr, dbl, gl in SECTIONS:
    for mel, (root, kind) in zip(melody, chords):
        t_bar = bar_no * BAR
        r_midi = 36 + ((root + tr) % 12)                                     # bass register around C2..B2
        pcs = triad(root, kind)
        stab_notes = voicing(pcs, tr)
        # oom-pah: bass on 1 and 3 (root, then fifth), chord stab on 2 and 4
        add(bass(r_midi), t_bar, pan=-0.05, gain=0.62)
        add(bass(r_midi + 7), t_bar + 2 * BEAT, pan=-0.05, gain=0.5)              # the fifth
        for beat in (1, 3):
            add(stab(stab_notes), t_bar + beat * BEAT, pan=-0.35, gain=0.34)
        # light drums (the very first two bars stay bare for a gentle start)
        if bar_no >= 2:
            for beat in (0, 2):
                add(kick(), t_bar + beat * BEAT, gain=0.55)
            for beat in (1, 3):
                add(snare(), t_bar + beat * BEAT, pan=0.05, gain=0.22)
        for e in range(8):
            add(hat(open_=(e % 2 == 1 and e == 7)), t_bar + e * EIGHTH, pan=0.4, gain=(0.11 if e % 2 == 0 else 0.17))
        # melody
        pos = 0
        for m, ln in mel:
            if m is not None:
                mm = m + tr
                t_note = t_bar + pos * EIGHTH
                add(xylo(mm, dur=0.55 + 0.25 * ln), t_note, pan=0.0, gain=0.5)
                if dbl:
                    add(xylo(mm - 12, dur=0.7), t_note, pan=-0.1, gain=0.5 * dbl)
                if gl:
                    add(glock(mm), t_note, pan=0.15, gain=0.32 * gl)
            pos += ln
        bar_no += 1

# drum fill in the last bar, then the finale on bar 49 (t = 90.0 s, when the pelican stops)
t_fill = (bar_no - 1) * BAR + 3 * BEAT
for k in range(8):
    add(snare(), t_fill + k * EIGHTH / 2, gain=0.12 + 0.03 * k)
T_END = bar_no * BAR                                                        # 90.0 s
finale_root = 2                                                             # D major
add(crash(), T_END, pan=0.1, gain=0.5)
add(kick(), T_END, gain=0.7)
add(bass(38, dur=1.6), T_END, gain=0.8)
add(bass(50, dur=1.2), T_END, gain=0.35)
add(stab([62, 66, 69, 74], dur=1.9, sustain=True), T_END, pan=-0.2, gain=0.55)
for m in (74, 78, 81):
    add(xylo(m, dur=1.8), T_END, gain=0.42)
add(glock(78), T_END, pan=0.2, gain=0.3)
# and the bell says goodbye / hello
bell(0.25)

# ------------------------------------------------------------------ space + master
def reverb(x, seed, seconds=1.1, decay=4.2):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * decay)
    ir[:int(0.012 * SR)] *= 0.0                                         # tiny pre-delay
    ir /= np.sqrt((ir ** 2).sum())
    return fftconvolve(x, ir)[:len(x)]


wetL, wetR = reverb(L, 11), reverb(R, 12)
outL = L + 0.16 * wetL
outR = R + 0.16 * wetR

n_out = int(TOTAL_S * SR)
out = np.stack([outL[:n_out], outR[:n_out]], axis=1)
fade = int(0.6 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5                  # fade the last chord out at the end of the video
out = np.tanh(1.5 * out) / np.tanh(1.5)                                  # gentle soft clip
out *= 0.89 / np.abs(out).max()
pcm = (out * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = 20 * np.log10(np.sqrt((out ** 2).mean()))
print(f"wrote {OUT}: {n_out / SR:.2f} s, {bar_no} bars @ {BPM} bpm, finale at {T_END:.2f} s, peak {np.abs(out).max():.2f}, rms {rms:.1f} dBFS")
