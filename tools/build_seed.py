#!/usr/bin/env python3
"""Genera sql/seed.sql con las piezas y los juegos del comparador.

Calibración:
  CPU: puntaje relativo de juegos con Ryzen 5 5600 = 100.
       Los marcados 'medido' salen del ranking de Tom's Hardware 2026
       (1080p, RTX 5090, 17 juegos) reescalado para que el 5600 valga 100.
  GPU: rendimiento relativo con RTX 4060 = 100.
       Los marcados 'medido' salen del ranking de Tom's Hardware 2026
       (1440p Ultra, Ryzen 7 9800X3D, 11 juegos, sin escalado).
  Juegos: FPS base en una RTX 4060 a 1080p calidad alta (gpu_base) y
       tope de FPS en un Ryzen 5 5600 (cpu_base). Algunos valores se
       anclaron con mediciones de TechSpot; el resto son estimaciones.
Todo lo marcado 'estimado' es una aproximación, no una medición.
"""
import pathlib
import re

# --- CPU ---------------------------------------------------------------
# En la escala de Tom's Hardware (9850X3D = 100) el Ryzen 5 5600 queda cerca
# de 53,5: el 7800X3D rinde entre 52 % y 72 % más que él según TechSpot.
TH_CPU_REF_5600 = 53.5

# (nombre, marca, puntaje en escala TH)
CPU_TH = [
    ("Ryzen 7 9850X3D", "AMD", 100.0), ("Ryzen 7 9800X3D", "AMD", 97.0),
    ("Ryzen 9 9950X3D", "AMD", 95.7), ("Ryzen 9 9900X3D", "AMD", 86.9),
    ("Ryzen 7 7800X3D", "AMD", 85.6), ("Ryzen 9 7950X3D", "AMD", 83.9),
    ("Ryzen 5 7600X3D", "AMD", 80.6), ("Core i9-14900K", "Intel", 78.2),
    ("Core Ultra 7 270K Plus", "Intel", 77.5), ("Ryzen 9 7900X3D", "AMD", 77.1),
    ("Ryzen 9 9950X", "AMD", 76.9), ("Core i9-13900K", "Intel", 76.8),
    ("Core i7-14700K", "Intel", 76.4), ("Core i7-13700K", "Intel", 75.8),
    ("Ryzen 9 9900X", "AMD", 73.9), ("Core Ultra 5 250K Plus", "Intel", 73.3),
    ("Core i5-14600K", "Intel", 72.8), ("Ryzen 5 9600X", "AMD", 72.6),
    ("Core Ultra 9 285K", "Intel", 71.8), ("Ryzen 9 7950X", "AMD", 71.0),
    ("Core i5-13600K", "Intel", 70.9), ("Ryzen 7 7700X", "AMD", 70.6),
    ("Core Ultra 7 265K", "Intel", 70.3), ("Ryzen 9 7900X", "AMD", 69.2),
    ("Ryzen 5 7600X", "AMD", 67.3), ("Core Ultra 5 245K", "Intel", 67.1),
    ("Core i7-12700K", "Intel", 65.8), ("Core Ultra 5 225", "Intel", 62.5),
    ("Core i5-12600K", "Intel", 60.8), ("Core i5-14400", "Intel", 58.0),
]
# (nombre, marca, puntaje con 5600 = 100)
CPU_EST = [
    ("Core i5-8400", "Intel", 66), ("Core i7-8700K", "Intel", 78),
    ("Core i5-9400F", "Intel", 66), ("Core i7-9700K", "Intel", 85),
    ("Core i3-10100", "Intel", 62), ("Core i5-10400", "Intel", 78),
    ("Core i7-10700K", "Intel", 95), ("Core i5-11400", "Intel", 90),
    ("Core i3-12100F", "Intel", 88), ("Core i5-12400F", "Intel", 100),
    ("Core i5-13400F", "Intel", 108), ("Core i5-14400F", "Intel", 110),
    ("Ryzen 5 1600", "AMD", 46), ("Ryzen 5 2600", "AMD", 58),
    ("Ryzen 5 3600", "AMD", 80), ("Ryzen 5 5500", "AMD", 92),
    ("Ryzen 5 5600", "AMD", 100), ("Ryzen 5 5600X", "AMD", 105),
    ("Ryzen 7 5700X", "AMD", 108), ("Ryzen 7 5800X", "AMD", 115),
    ("Ryzen 9 5900X", "AMD", 115), ("Ryzen 7 5800X3D", "AMD", 130),
    ("Ryzen 7 7700X3D", "AMD", 150),
]

# --- GPU ---------------------------------------------------------------
TH_GPU_REF_4060 = 28.4  # RTX 4060 en 1440p Ultra (% del RTX 5090)

# (nombre, marca, % en 1440p Ultra, VRAM GB)
GPU_TH = [
    ("GeForce RTX 5090", "NVIDIA", 100.0, 32), ("GeForce RTX 4090", "NVIDIA", 85.7, 24),
    ("GeForce RTX 5080", "NVIDIA", 76.7, 16), ("Radeon RX 7900 XTX", "AMD", 73.1, 24),
    ("GeForce RTX 4080 Super", "NVIDIA", 70.9, 16), ("GeForce RTX 4080", "NVIDIA", 70.3, 16),
    ("GeForce RTX 5070 Ti", "NVIDIA", 69.8, 16), ("Radeon RX 9070 XT", "AMD", 69.7, 16),
    ("Radeon RX 7900 XT", "AMD", 64.6, 20), ("GeForce RTX 4070 Ti Super", "NVIDIA", 62.1, 16),
    ("Radeon RX 9070", "AMD", 62.1, 16), ("GeForce RTX 3090 Ti", "NVIDIA", 59.7, 24),
    ("GeForce RTX 4070 Ti", "NVIDIA", 58.6, 12), ("GeForce RTX 5070", "NVIDIA", 57.6, 12),
    ("GeForce RTX 3090", "NVIDIA", 54.7, 24), ("GeForce RTX 4070 Super", "NVIDIA", 54.5, 12),
    ("Radeon RX 6950 XT", "AMD", 53.5, 16), ("GeForce RTX 3080 Ti", "NVIDIA", 53.3, 12),
    ("Radeon RX 9070 GRE", "AMD", 51.8, 12), ("Radeon RX 7800 XT", "AMD", 50.7, 16),
    ("Radeon RX 6900 XT", "AMD", 50.2, 16), ("GeForce RTX 3080", "NVIDIA", 49.0, 10),
    ("Radeon RX 6800 XT", "AMD", 47.6, 16), ("GeForce RTX 4070", "NVIDIA", 46.5, 12),
    ("GeForce RTX 5060 Ti 16GB", "NVIDIA", 43.9, 16), ("Radeon RX 7700 XT", "AMD", 43.4, 12),
    ("Radeon RX 9060 XT 16GB", "AMD", 40.2, 16), ("GeForce RTX 5060 Ti 8GB", "NVIDIA", 41.0, 8),
    ("GeForce RTX 3070 Ti", "NVIDIA", 40.0, 8), ("Radeon RX 9060 XT 8GB", "AMD", 37.3, 8),
    ("GeForce RTX 4060 Ti 16GB", "NVIDIA", 36.2, 16), ("Radeon RX 7600 XT", "AMD", 30.0, 16),
    ("GeForce RTX 3070", "NVIDIA", 34.8, 8), ("GeForce RTX 4060 Ti 8GB", "NVIDIA", 35.2, 8),
    ("Radeon RX 6750 XT", "AMD", 34.4, 12), ("GeForce RTX 5060", "NVIDIA", 35.8, 8),
    ("Radeon RX 6700 XT", "AMD", 32.5, 12), ("Arc B580", "Intel", 30.3, 12),
    ("GeForce RTX 3060 Ti", "NVIDIA", 30.5, 8), ("GeForce RTX 4060", "NVIDIA", 28.4, 8),
    ("Radeon RX 7600", "AMD", 27.2, 8), ("GeForce RTX 5050", "NVIDIA", 27.1, 8),
    ("Arc B570", "Intel", 26.5, 10), ("GeForce RTX 3060 12GB", "NVIDIA", 25.0, 12),
    ("Radeon RX 6650 XT", "AMD", 22.7, 8), ("Radeon RX 6600 XT", "AMD", 24.3, 8),
    ("Radeon RX 6600", "AMD", 14.9, 8), ("GeForce RTX 3050", "NVIDIA", 17.8, 8),
]
# (nombre, marca, puntaje con RTX 4060 = 100, VRAM GB)
GPU_EST = [
    ("GeForce GTX 1050 Ti", "NVIDIA", 33, 4), ("GeForce GTX 1650", "NVIDIA", 48, 4),
    ("GeForce GTX 1060 6GB", "NVIDIA", 55, 6), ("GeForce GTX 1660 Super", "NVIDIA", 70, 6),
    ("GeForce RTX 2060", "NVIDIA", 80, 6), ("GeForce RTX 2060 Super", "NVIDIA", 92, 8),
    ("GeForce RTX 2070 Super", "NVIDIA", 108, 8), ("Radeon RX 580 8GB", "AMD", 50, 8),
    ("Radeon RX 5700 XT", "AMD", 95, 8), ("Radeon RX 7900 GRE", "AMD", 200, 16),
    ("Arc A750", "Intel", 90, 8), ("Arc A770 16GB", "Intel", 100, 16),
    ("Intel UHD 630", "Integrada", 8, 2), ("Radeon 780M", "Integrada", 28, 2),
]

# --- Juegos ------------------------------------------------------------
# slug lo genera el script. Campos: nombre, tipo, gpu_base, cpu_base, res_k,
# qual_k, upscaling, fps_cap, ram_sens (pérdida con 8 GB de RAM), fuente.
GAMES = [
    ("Valorant", "comp", 520, 430, 0.35, 0.30, 0, None, 0.03, "estimado"),
    ("Counter-Strike 2", "comp", 400, 390, 0.60, 0.60, 0, None, 0.03, "medido"),
    ("League of Legends", "comp", 600, 450, 0.30, 0.30, 0, None, 0.03, "estimado"),
    ("Dota 2", "comp", 450, 300, 0.35, 0.30, 0, None, 0.03, "estimado"),
    ("Overwatch 2", "comp", 330, 400, 0.50, 0.50, 0, None, 0.05, "estimado"),
    ("Rainbow Six Siege", "comp", 350, 400, 0.50, 0.50, 0, None, 0.05, "estimado"),
    ("Fortnite", "comp", 140, 178, 0.80, 1.00, 1, None, 0.08, "medido"),
    ("Apex Legends", "comp", 200, 250, 0.70, 0.80, 0, None, 0.06, "estimado"),
    ("Call of Duty: Warzone", "comp", 105, 235, 0.85, 1.00, 1, None, 0.08, "medido"),
    ("Marvel Rivals", "comp", 90, 160, 0.85, 1.00, 1, None, 0.12, "estimado"),
    ("Battlefield 6", "ex", 82, 150, 0.90, 1.10, 1, None, 0.10, "estimado"),
    ("GTA V", "ex", 150, 170, 0.70, 0.90, 0, None, 0.05, "estimado"),
    ("Red Dead Redemption 2", "ex", 70, 140, 0.90, 1.10, 1, None, 0.10, "estimado"),
    ("Cyberpunk 2077", "ex", 78, 140, 0.95, 1.20, 1, None, 0.12, "medido"),
    ("Baldur's Gate 3", "ex", 80, 100, 0.90, 1.00, 1, None, 0.10, "estimado"),
    ("Elden Ring", "ex", 85, 120, 0.85, 1.00, 0, 60, 0.08, "estimado"),
    ("Black Myth: Wukong", "ex", 45, 120, 1.00, 1.30, 1, None, 0.12, "estimado"),
    ("Hogwarts Legacy", "ex", 70, 110, 0.90, 1.10, 1, None, 0.12, "estimado"),
    ("Marvel's Spider-Man Remastered", "ex", 110, 92, 0.85, 1.00, 1, None, 0.10, "medido"),
    ("The Last of Us Part I", "ex", 62, 110, 0.95, 1.10, 1, None, 0.15, "medido"),
    ("Starfield", "ex", 55, 70, 0.90, 1.10, 1, None, 0.12, "medido"),
    ("Escape from Tarkov", "ex", 110, 95, 0.60, 0.80, 0, None, 0.20, "estimado"),
]


# Trazado de rayos: fracción del rendimiento que conserva cada GPU con RT activado
# (estimación por generación, no medición).
def rt_perf(name, brand):
    n = name.lower()
    if brand == "NVIDIA":
        if "gtx" in n:
            return 0.20
        return 0.62 if re.search(r"rtx (4|5)0", n) else 0.52
    if brand == "AMD":
        if "rx 9" in n:
            return 0.60
        if "rx 7" in n:
            return 0.48
        if "rx 6" in n:
            return 0.38
        return 0.20
    if brand == "Intel":
        return 0.50
    return 0.15


# Cuánto pesa el trazado de rayos en cada juego (0 = el juego no lo tiene) y
# qué juegos admiten generación de fotogramas.
RT_K = {
    "Cyberpunk 2077": 1.7, "Black Myth: Wukong": 1.6, "Hogwarts Legacy": 1.2,
    "Marvel's Spider-Man Remastered": 0.8, "Fortnite": 1.3, "GTA V": 1.0, "Elden Ring": 0.8,
}
FRAME_GEN = {
    "Cyberpunk 2077", "Black Myth: Wukong", "Hogwarts Legacy",
    "Marvel's Spider-Man Remastered", "Starfield", "Marvel Rivals",
}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def cpus():
    out = []
    for name, brand, th in CPU_TH:
        out.append((slug(name), name, brand, round(th * 100 / TH_CPU_REF_5600), "medido"))
    for name, brand, score in CPU_EST:
        out.append((slug(name), name, brand, score, "estimado"))
    return sorted(out, key=lambda r: (r[2], r[3]))


def gpus():
    out = []
    for name, brand, pct, vram in GPU_TH:
        out.append((slug(name), name, brand, round(pct * 100 / TH_GPU_REF_4060), vram, rt_perf(name, brand), "medido"))
    for name, brand, score, vram in GPU_EST:
        out.append((slug(name), name, brand, score, vram, rt_perf(name, brand), "estimado"))
    return sorted(out, key=lambda r: (r[2], r[3]))


def games():
    return [(slug(g[0]),) + g + (RT_K.get(g[0], 0.0), 1 if g[0] in FRAME_GEN else 0) for g in GAMES]


def q(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def rows(table, cols, data):
    lines = ",\n".join("  (" + ", ".join(q(v) for v in row) + ")" for row in data)
    return "INSERT INTO %s (%s) VALUES\n%s;\n" % (table, ", ".join(cols), lines)


def build():
    parts = [
        "-- Generado por tools/build_seed.py. Ejecutar una sola vez en una base nueva.\n",
        rows("cpus", ["slug", "name", "brand", "score", "source"], cpus()),
        rows("gpus", ["slug", "name", "brand", "score", "vram_gb", "rt_perf", "source"], gpus()),
        rows("games", ["slug", "name", "tag", "gpu_base", "cpu_base", "res_k", "qual_k",
                       "upscaling", "fps_cap", "ram_sens", "source", "rt_k", "fg"], games()),
    ]
    return "\n".join(parts)


if __name__ == "__main__":
    target = pathlib.Path(__file__).resolve().parent.parent / "sql" / "seed.sql"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(build(), encoding="utf-8")
    print("seed.sql: %d CPUs, %d GPUs, %d juegos" % (len(cpus()), len(gpus()), len(GAMES)))
