#!/usr/bin/env python3
"""Abre el comparador en tu PC sin XAMPP ni MySQL.

Usa el servidor incorporado de PHP y una base SQLite local (carpeta data/).
Requisitos: Python 3 y PHP 8.1 o superior con la extensión pdo_sqlite.

    python tools/run_local.py            # abre http://127.0.0.1:8080
    python tools/run_local.py --no-browser

Asesor con IA (opcional): pon tu clave de la API de Anthropic en la variable FPS_LLM_KEY o en el
archivo data/llm_key.txt. Sin clave, el asistente sigue funcionando con reglas.
"""
import json
import os
import pathlib
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB = DATA / "local.sqlite"

NO_PHP = """No encuentro PHP en el PATH.
  Windows: descarga el zip "Non Thread Safe" de https://windows.php.net/download,
           descomprímelo en C:\\php y agrega esa carpeta al PATH.
  Ubuntu:  sudo apt install php-cli php-sqlite3
  macOS:   brew install php
Después abre una terminal nueva y vuelve a ejecutar este script."""

NO_SQLITE = """Tu PHP no tiene la extensión pdo_sqlite.
  Windows: en la carpeta de PHP copia php.ini-development a php.ini, ábrelo y quita el ';' de
           estas líneas:  extension_dir = "ext"   extension=pdo_sqlite   extension=sqlite3
  Ubuntu:  sudo apt install php-sqlite3"""


def find_php():
    php = shutil.which("php")
    if not php:
        sys.exit(NO_PHP)
    out = subprocess.run([php, "-m"], capture_output=True, text=True).stdout.lower()
    if "pdo_sqlite" not in out:
        sys.exit(NO_SQLITE)
    return php


def llm_key():
    key = os.environ.get("FPS_LLM_KEY", "").strip()
    f = DATA / "llm_key.txt"
    if not key and f.exists():
        key = f.read_text(encoding="utf-8").strip()
    return key


def php_flags(php):
    """Activa curl y openssl sin tocar php.ini (necesarios para hablar con la API) y fija los certificados."""
    mods = subprocess.run([php, "-m"], capture_output=True, text=True).stdout.lower().split()
    flags = []
    if os.name == "nt":
        ext = pathlib.Path(php).resolve().parent / "ext"
        if ext.is_dir():
            flags += ["-d", "extension_dir=" + str(ext)]
        for m in ("curl", "openssl"):
            if m not in mods:
                flags += ["-d", "extension=" + m]
        DATA.mkdir(exist_ok=True)
        ca = DATA / "cacert.pem"
        if not ca.exists():
            try:
                print("Descargando certificados (cacert.pem) para conectar con la IA...")
                urllib.request.urlretrieve("https://curl.se/ca/cacert.pem", str(ca))
            except Exception as e:
                print("No pude descargar cacert.pem:", e)
        if ca.exists():
            flags += ["-d", "curl.cainfo=" + str(ca), "-d", "openssl.cafile=" + str(ca)]
    return flags


def db_is_current():
    """La base local es de una versión vieja si le faltan las columnas de los ajustes nuevos."""
    try:
        con = sqlite3.connect(DB)
        try:
            cols = [r[1] for r in con.execute("PRAGMA table_info(gpus)")]
            bcols = [r[1] for r in con.execute("PRAGMA table_info(builds)")]
        finally:
            con.close()
        return "rt_perf" in cols and "rt" in bcols
    except sqlite3.Error:
        return False


def make_db():
    if DB.exists():
        if db_is_current():
            return
        backup = DB.with_suffix(".sqlite.bak")
        shutil.move(str(DB), str(backup))
        print("La base local era de una versión anterior. Se guardó una copia en", backup, "y se crea una nueva.")
    DATA.mkdir(exist_ok=True)
    seed = ROOT / "sql" / "seed.sql"
    if not seed.exists():
        subprocess.run([sys.executable, str(ROOT / "tools" / "build_seed.py")], check=True)
    con = sqlite3.connect(DB)
    try:
        con.executescript((ROOT / "tests" / "schema.sqlite.sql").read_text(encoding="utf-8"))
        con.executescript(seed.read_text(encoding="utf-8"))
        con.commit()
    finally:
        con.close()
    print("Base local creada en", DB)


def free_port(start):
    for port in range(start, start + 20):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    sys.exit("No hay puertos libres entre %d y %d" % (start, start + 19))


def main():
    php = find_php()
    make_db()
    port = free_port(int(os.environ.get("PORT", "8080")))
    url = "http://127.0.0.1:%d/" % port
    env = dict(os.environ, FPS_DB_DRIVER="sqlite", FPS_SQLITE_PATH=str(DB))
    flags = []
    key = llm_key()
    if key:
        env["FPS_LLM_KEY"] = key
        flags = php_flags(php)
    server = subprocess.Popen([php] + flags + ["-S", "127.0.0.1:%d" % port, "-t", str(ROOT / "public")],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(50):
            try:
                opener.open(url + "api/catalog.php", timeout=1).read()
                break
            except Exception:
                time.sleep(0.2)
        else:
            sys.exit("El servidor de PHP no respondió. Prueba con otro puerto: PORT=8090 python tools/run_local.py")
        print("Comparador de FPS funcionando en", url)
        try:
            on = json.load(opener.open(url + "api/chat.php", timeout=3)).get("enabled")
        except Exception:
            on = False
        if on:
            print("Asesor con IA: activo.")
        elif key:
            print("Asesor con IA: hay clave pero a PHP le falta la extensión curl. Byte seguirá con reglas.")
        else:
            print("Asesor con IA: apagado (sin clave). Byte responde con reglas. Mira el README para activarlo.")
        print("Para detenerlo presiona Ctrl+C.")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        server.wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
