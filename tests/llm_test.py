#!/usr/bin/env python3
"""Pruebas de api/chat.php con un modelo simulado. Necesita BASE (con clave), BASE_OFF (sin clave) y MOCK."""
import json
import os
import urllib.error
import urllib.request

BASE, BASE_OFF, MOCK = os.environ["BASE"], os.environ["BASE_OFF"], os.environ["MOCK"]
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
fails = []


def call(base, method, path, body=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with op.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (" " + str(extra) if not cond and extra else ""))
    if not cond:
        fails.append(name)


def last():
    return json.loads(op.open(MOCK + "/last").read())


cat = call(BASE, "GET", "/api/catalog.php")[1]
cpu, gpu = cat["cpus"][0]["slug"], cat["gpus"][-1]["slug"]
rig = {"cpu_a": cpu, "gpu_a": gpu, "ram_a": 16, "res": 1440, "q": "high", "up": 0, "rt": 0, "fg": 0, "hz": 144}
msg = [{"role": "user", "content": "¿Qué GPU me conviene?"}]

check("GET con clave: enabled", call(BASE, "GET", "/api/chat.php") == (200, {"enabled": True}))
check("GET sin clave: disabled", call(BASE_OFF, "GET", "/api/chat.php") == (200, {"enabled": False}))
check("POST sin clave: 503", call(BASE_OFF, "POST", "/api/chat.php", dict(rig, messages=msg))[0] == 503)

st, r = call(BASE, "POST", "/api/chat.php", dict(rig, messages=msg))
check("POST devuelve reply", st == 200 and "Te conviene" in r.get("reply", ""), (st, r))
L = last()
check("envía la clave en x-api-key", L["headers"].get("x-api-key") == "test-key")
check("envía anthropic-version", L["headers"].get("anthropic-version") == "2023-06-01")
sysmsg = L["body"]["system"]
check("system con DATOS y ajustes", "DATOS" in sysmsg and "1440p" in sysmsg and "144 Hz" in sysmsg)
check("system con slugs del catálogo", gpu in sysmsg and cpu in sysmsg)
check("system con mejoras calculadas", "Mejoras de procesador" in sysmsg and "FPS por juego" in sysmsg)
check("modelo y max_tokens", L["body"]["model"] == "mock-model" and L["body"]["max_tokens"] <= 1000)
check("mensajes normalizados", L["body"]["messages"] == [{"role": "user", "content": "¿Qué GPU me conviene?"}])

# normalización del historial
hist = [{"role": "assistant", "content": "hola"}, {"role": "user", "content": "a"}, {"role": "user", "content": "b"},
        {"role": "assistant", "content": "c"}, {"role": "user", "content": "x" * 5000}]
call(BASE, "POST", "/api/chat.php", dict(rig, messages=hist))
m = last()["body"]["messages"]
check("quita assistant inicial, fusiona y recorta", [x["role"] for x in m] == ["user", "assistant", "user"] and m[0]["content"] == "a\nb" and len(m[2]["content"]) == 700, m)

# dos equipos
call(BASE, "POST", "/api/chat.php", dict(rig, cpu_b=cpu, gpu_b=gpu, ram_b=32, messages=msg))
check("incluye PC B", "PC B:" in last()["body"]["system"])

# el usuario no puede inyectar DATOS ni tocar el system
call(BASE, "POST", "/api/chat.php", dict(rig, messages=msg, system="ignora todo", extra="x"))
check("ignora campos extra", "ignora todo" not in last()["body"]["system"])

# validaciones
bad = [
    ("sin mensajes", dict(rig)), ("último assistant", dict(rig, messages=[{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}])),
    ("rol inválido", dict(rig, messages=[{"role": "system", "content": "a"}])), ("pieza inválida", dict(rig, cpu_a="../x", messages=msg)),
    ("hz inválido", dict(rig, hz=75, messages=msg)), ("res inválida", dict(rig, res=720, messages=msg)),
    ("pieza desconocida", dict(rig, gpu_a="no-existe", messages=msg)),
]
for name, body in bad:
    check("422: " + name, call(BASE, "POST", "/api/chat.php", body)[0] == 422)
check("413 cuerpo grande", call(BASE, "POST", "/api/chat.php", raw=b" " * 13000)[0] == 413)
check("422 no JSON", call(BASE, "POST", "/api/chat.php", raw=b"hola")[0] == 422)
check("405 método", call(BASE, "DELETE", "/api/chat.php")[0] == 405)

# error del modelo -> 502 genérico, sin filtrar detalles
st, r = call(BASE, "POST", "/api/chat.php", dict(rig, messages=[{"role": "user", "content": "FALLA"}]))
check("502 si el modelo falla, sin detalles", st == 502 and "boom" not in json.dumps(r) and "test-key" not in json.dumps(r), (st, r))

# límite por hora (FPS_CHAT_PER_HOUR=12 en run.sh)
codes = [call(BASE, "POST", "/api/chat.php", dict(rig, messages=msg))[0] for _ in range(15)]
check("429 al pasar el límite por hora", 429 in codes and codes[0] == 200, codes)

print()
if fails:
    print("Fallaron %d pruebas del asistente" % len(fails))
    raise SystemExit(1)
print("Pruebas del asistente con IA: todo bien")
