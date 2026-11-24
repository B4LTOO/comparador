#!/usr/bin/env python3
"""Pruebas de la API. Recalcula los FPS en Python y los compara con los de PHP."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import build_seed as seed  # noqa: E402

BASE = os.environ["BASE"]
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
failures = []


def call(method, path, body=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (" " + str(extra) if not cond and extra else ""))
    if not cond:
        failures.append(name)


# --- Modelo de referencia en Python (misma fórmula que engine.php) ---------
CPU = {c[0]: {"score": c[3]} for c in seed.cpus()}
GPU = {g[0]: {"score": g[3], "vram": g[4], "rt": g[5]} for g in seed.gpus()}
GAME = {g[0]: g for g in seed.games()}
RES = {1080: 1.0, 1440: 1.78, 3440: 2.39, 2160: 4.0}
UP_GAIN = {0: 0.0, 1: 0.35, 2: 0.55, 3: 0.80}
UP_W = {1080: 0.7, 1440: 0.9, 3440: 1.0, 2160: 1.0}
QUAL = {"low": 1.5, "mid": 1.22, "high": 1.0, "ultra": 0.8}


def expected(game_slug, cpu, gpu, ram, res, q, up=0, rt=False, fg=False):
    """Devuelve (fps mostrados, fps reales) con la misma fórmula que engine.php."""
    _, _, _, gpu_base, cpu_base, res_k, qual_k, upscaling, cap, ram_sens, _, rt_k, has_fg = GAME[game_slug]
    gf = gpu_base * GPU[gpu]["score"] / 100 * RES[res] ** -res_k * QUAL[q] ** qual_k
    if rt and rt_k > 0:
        gf *= GPU[gpu]["rt"] ** rt_k
    if up and upscaling:
        gf *= 1 + UP_GAIN[up] * res_k * UP_W[res]
    if GPU[gpu]["vram"] <= 8:
        gf *= 0.75 if res == 2160 else (0.9 if res == 3440 else 1.0)
    cf = cpu_base * CPU[cpu]["score"] / 100
    fps = (gf ** -4 + cf ** -4) ** -0.25
    if ram <= 8:
        fps *= 1 - ram_sens
    capped = False
    if cap is not None and fps > cap:
        fps, capped = float(cap), True
    shown = fps
    if fg and has_fg and not capped:
        shown = fps * (1.75 if fps >= 60 else 1.6 if fps >= 40 else 1.3)
    return shown, fps


def qs(**kw):
    return urllib.parse.urlencode(kw)


# --- Catálogo ----------------------------------------------------------------
st, cat = call("GET", "/api/catalog.php")
check("catálogo responde 200", st == 200)
check("catálogo trae piezas y juegos", len(cat["cpus"]) == len(CPU) and len(cat["gpus"]) == len(GPU) and len(cat["games"]) == len(GAME),
      (len(cat["cpus"]), len(cat["gpus"]), len(cat["games"])))
check("catálogo no expone coeficientes", "score" not in cat["cpus"][0] and "gpu_base" not in cat["games"][0])

# --- Estimación: PHP contra Python ---------------------------------------------
cases = [
    ("core-i5-10400", "geforce-rtx-5070-ti", 16, 1080, "high", 0),
    ("ryzen-7-7800x3d", "geforce-rtx-5070-ti", 16, 1080, "high", 0),
    ("ryzen-5-5600", "geforce-rtx-4060", 8, 1440, "ultra", 1),
    ("core-i7-12700k", "radeon-rx-9070-xt", 32, 2160, "low", 1),
    ("ryzen-5-3600", "geforce-rtx-5060", 16, 2160, "mid", 0),
    ("ryzen-7-7800x3d", "geforce-rtx-5070-ti", 16, 3440, "high", 2),
    ("core-i5-12400f", "geforce-rtx-4060", 16, 1440, "high", 3),
]
worst = 0.0
for cpu, gpu, ram, res, q, up in cases:
  for rt, fg in ((0, 0), (1, 1)):
    st, out = call("GET", "/api/estimate.php?" + qs(cpu_a=cpu, gpu_a=gpu, ram_a=ram, res=res, q=q, up=up, rt=rt, fg=fg))
    ok = st == 200 and len(out["games"]) == len(GAME)
    check("estimate %s + %s %dp %s up=%d rt=%d fg=%d" % (cpu, gpu, res, q, up, rt, fg), ok)
    if ok:
        for g in out["games"]:
            shown, real = expected(g["slug"], cpu, gpu, ram, res, q, up, bool(rt), bool(fg))
            worst = max(worst, abs(g["a"]["fps"] - shown), abs(g["a"]["base_fps"] - real))
check("PHP y Python coinciden (dif. máx. %.3f FPS)" % worst, worst < 0.06, worst)

# --- Comparación A/B y sentido común ---------------------------------------------
st, out = call("GET", "/api/estimate.php?" + qs(cpu_a="core-i5-10400", gpu_a="geforce-rtx-5070-ti", cpu_b="ryzen-7-7800x3d", gpu_b="geforce-rtx-5070-ti"))
cs2 = [g for g in out["games"] if g["slug"] == "counter-strike-2"][0]
check("CS2: el 10400 limita y el 7800X3D rinde más", cs2["a"]["lim"] == "cpu" and cs2["b"]["fps"] > cs2["a"]["fps"] * 1.5, cs2)
check("CS2: con CPU limitando la GPU queda holgada", cs2["a"]["gpu_use"] < 60, cs2["a"])
elden = [g for g in out["games"] if g["slug"] == "elden-ring"][0]
check("Elden Ring queda en 60 FPS", elden["a"]["fps"] == 60.0 and elden["a"]["lim"] == "cap")
st, low = call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", ram_a=8))
st, mid = call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", ram_a=16))
pairs = list(zip(low["games"], mid["games"]))
check("8 GB de RAM baja los FPS (salvo en juegos con tope)",
      all(l["a"]["fps"] < m["a"]["fps"] for l, m in pairs if m["a"]["lim"] != "cap")
      and all(l["a"]["fps"] <= m["a"]["fps"] for l, m in pairs))
check("8 GB de RAM empeora los mínimos 1%", all(l["a"]["low"] < m["a"]["low"] for l, m in pairs))

# --- Ajustes nuevos: trazado de rayos, escalado, generación de fotogramas, ultrapanorámico ---
def fps_of(slug, **kw):
    kw.setdefault("cpu_a", "ryzen-7-7800x3d")
    kw.setdefault("gpu_a", "geforce-rtx-4070-super")
    st, o = call("GET", "/api/estimate.php?" + qs(**kw))
    return {g["slug"]: g for g in o["games"]}


off = fps_of(0, res=1440, q="high")
on = fps_of(0, res=1440, q="high", rt=1)
rt_games = [s for s, g in GAME.items() if g[11] > 0]
check("trazado de rayos baja los FPS en los juegos que lo tienen", all(on[s]["a"]["fps"] <= off[s]["a"]["fps"] for s in rt_games)
      and all(on[s]["a"]["fps"] < off[s]["a"]["fps"] for s in ("cyberpunk-2077", "black-myth-wukong", "hogwarts-legacy")))
check("trazado de rayos no toca los juegos sin él", all(on[s]["a"]["fps"] == off[s]["a"]["fps"] for s in GAME if s not in rt_games))
check("las features salen marcadas", on["cyberpunk-2077"]["feat"]["rt"] is True and on["counter-strike-2"]["feat"]["rt"] is False)
amd = fps_of(0, gpu_a="radeon-rx-7800-xt", res=1440, rt=1)["cyberpunk-2077"]["a"]["fps"] / fps_of(0, gpu_a="radeon-rx-7800-xt", res=1440)["cyberpunk-2077"]["a"]["fps"]
nv = on["cyberpunk-2077"]["a"]["fps"] / off["cyberpunk-2077"]["a"]["fps"]
check("RT castiga más a AMD 7000 que a NVIDIA 40", amd < nv, (amd, nv))
ups = [fps_of(0, res=2160, q="high", up=u)["cyberpunk-2077"]["a"]["fps"] for u in range(4)]
check("el escalado sube los FPS en orden: apagado < calidad < equilibrado < rendimiento", ups == sorted(ups) and len(set(ups)) == 4, ups)
fgo = fps_of(0, res=1440, fg=1)
base = fps_of(0, res=1440)
check("generación de fotogramas multiplica solo en juegos compatibles",
      fgo["cyberpunk-2077"]["a"]["fps"] > base["cyberpunk-2077"]["a"]["fps"] * 1.25 and fgo["cyberpunk-2077"]["a"]["fg"] is True
      and fgo["counter-strike-2"]["a"]["fps"] == base["counter-strike-2"]["a"]["fps"] and fgo["counter-strike-2"]["a"]["fg"] is False)
check("los FPS reales no cambian con generación de fotogramas", fgo["cyberpunk-2077"]["a"]["base_fps"] == base["cyberpunk-2077"]["a"]["fps"])
r = {k: fps_of(0, res=k, q="high", gpu_a="geforce-rtx-5070-ti")["cyberpunk-2077"]["a"]["fps"] for k in (1440, 3440, 2160)}
check("ultrapanorámico queda entre 1440p y 4K", r[2160] < r[3440] < r[1440], r)

# --- Consejos de mejora ---
st, adv = call("GET", "/api/advise.php?" + qs(cpu_a="core-i5-10400", gpu_a="geforce-rtx-5070-ti", cpu_b="ryzen-7-9800x3d", gpu_b="geforce-gtx-1060-6gb"))
check("advise responde con ambos equipos", st == 200 and set(adv["rigs"]) == {"a", "b"}, adv)
ra = adv["rigs"]["a"]
check("advise: hasta 4 candidatos de CPU y GPU, todos con mejora positiva",
      0 < len(ra["cpu"]) <= 4 and all(o["gain"] > 0 for o in ra["cpu"] + ra["gpu"]) and len(ra["gpu"]) <= 4, ra)
check("advise: con la GPU ya potente, cambiar la CPU rinde más que la GPU",
      max(o["gain"] for o in ra["cpu"]) > max([o["gain"] for o in ra["gpu"]] or [0]), ra)
check("advise: el B (GPU floja) gana más cambiando la GPU", max(o["gain"] for o in adv["rigs"]["b"]["gpu"]) > 20, adv["rigs"]["b"])
check("advise con tag competitivo responde", call("GET", "/api/advise.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", tag="comp"))[0] == 200)
check("advise con tag inválido → 422", call("GET", "/api/advise.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", tag="x"))[0] == 422)
check("advise pieza desconocida → 422", call("GET", "/api/advise.php?" + qs(cpu_a="nope", gpu_a="geforce-rtx-4060"))[0] == 422)

# --- Validación ----------------------------------------------------------------
check("pieza desconocida → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="no-existe", gpu_a="geforce-rtx-4060"))[0] == 422)
check("slug con caracteres raros → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="a' OR '1'='1", gpu_a="geforce-rtx-4060"))[0] == 422)
check("RAM inválida → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", ram_a=12))[0] == 422)
check("escalado inválido → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", up=9))[0] == 422)
check("resolución inválida → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", res=720))[0] == 422)
check("falta la GPU de A → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600"))[0] == 422)
check("PC B incompleto → 422", call("GET", "/api/estimate.php?" + qs(cpu_a="ryzen-5-5600", gpu_a="geforce-rtx-4060", cpu_b="ryzen-5-5600"))[0] == 422)
check("POST en estimate → 405", call("POST", "/api/estimate.php", {})[0] == 405)

# --- Comparaciones guardadas -------------------------------------------------------
body = {"title": "Mi <b>prueba</b>\n", "public": True, "cpu_a": "core-i5-10400", "gpu_a": "geforce-rtx-5070-ti", "ram_a": 16,
        "cpu_b": "ryzen-7-7800x3d", "gpu_b": "geforce-rtx-5070-ti", "ram_b": 32, "res": 3440, "q": "ultra", "up": 2, "rt": True, "fg": True}
st, made = call("POST", "/api/builds.php", body)
check("guardar → 201 con código y token", st == 201 and len(made.get("code", "")) == 8 and len(made.get("delete_token", "")) == 32, made)
st, got = call("GET", "/api/builds.php?code=" + made["code"])
check("leer por código", st == 200 and got["a"]["cpu"] == "core-i5-10400" and got["b"]["ram"] == 32 and got["settings"] == {"res": 3440, "q": "ultra", "up": 2, "rt": True, "fg": True}, got)
check("el título se limpia (sin saltos de línea)", "\n" not in (got["title"] or "") and len(got["title"]) <= 40, got["title"])
st, rec = call("GET", "/api/builds.php?recent=1")
check("aparece en recientes (es pública)", any(b["code"] == made["code"] for b in rec["builds"]))
st, priv = call("POST", "/api/builds.php", dict(body, public=False, title="Privada"))
st, rec = call("GET", "/api/builds.php?recent=1")
check("una privada no aparece en recientes", st == 200 and not any(b["code"] == priv["code"] for b in rec["builds"]))
st, one = call("POST", "/api/builds.php", {"cpu_a": "ryzen-5-5600", "gpu_a": "geforce-rtx-4060", "res": 1080, "q": "high"})
st, got = call("GET", "/api/builds.php?code=" + one["code"])
check("guardar sin PC B", got["b"] is None and got["a"]["ram"] == 16, got)
check("borrar con token incorrecto → 404", call("DELETE", "/api/builds.php?" + qs(code=made["code"], token="0" * 32))[0] == 404)
check("borrar con código mal formado → 422", call("DELETE", "/api/builds.php?" + qs(code="x", token="0" * 32))[0] == 422)
st, _ = call("DELETE", "/api/builds.php?" + qs(code=made["code"], token=made["delete_token"]))
check("borrar con el token correcto", st == 200)
check("ya no existe tras borrar", call("GET", "/api/builds.php?code=" + made["code"])[0] == 404)
check("JSON inválido → 422", call("POST", "/api/builds.php", raw=b"{no es json")[0] == 422)
check("cuerpo enorme → 413", call("POST", "/api/builds.php", raw=b'{"title":"' + b"a" * 5000 + b'"}')[0] == 413)
check("pieza desconocida al guardar → 422", call("POST", "/api/builds.php", dict(body, cpu_a="no-existe"))[0] == 422)
check("código inexistente → 404", call("GET", "/api/builds.php?code=aaaaaaaa")[0] == 404)
check("PUT → 405", call("PUT", "/api/builds.php", {})[0] == 405)

# --- Archivos estáticos ----------------------------------------------------------------
for path in ("/index.html", "/assets/app.js", "/assets/style.css"):
    req = urllib.request.Request(BASE + path)
    with opener.open(req) as r:
        check("sirve " + path, r.status == 200)

html = open(os.path.join(os.path.dirname(__file__), "..", "public", "index.html"), encoding="utf-8").read()
js = open(os.path.join(os.path.dirname(__file__), "..", "public", "assets", "app.js"), encoding="utf-8").read()
check("index.html sin estilos ni scripts en línea", " style=" not in html and "<script>" not in html and "onclick" not in html)
check("app.js sin innerHTML ni eval", "innerHTML" not in js and "eval(" not in js and "document.write" not in js)

print()
if failures:
    print("FALLARON %d pruebas" % len(failures))
    sys.exit(1)
print("Todas las pruebas pasaron")
