#!/usr/bin/env bash
# Pruebas locales: levanta el servidor de PHP con una base SQLite (misma
# estructura que MySQL) y ejecuta tests/api_test.py contra la API.
set -euo pipefail
cd "$(dirname "$0")/.."

for f in public/api/*.php config.example.php; do php -l "$f" >/dev/null; done
node --check public/assets/app.js
node --check public/assets/chat.js
node --check public/assets/parts.js
node --check public/assets/compat.js
node --check public/assets/shop.js

python3 tools/build_seed.py
TMP="$(mktemp -d)"
DB="$TMP/test.sqlite"
python3 - "$DB" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.executescript(open("tests/schema.sqlite.sql", encoding="utf-8").read())
con.executescript(open("sql/seed.sql", encoding="utf-8").read())
con.commit()
PY

PORT=8099
FPS_DB_DRIVER=sqlite FPS_SQLITE_PATH="$DB" php -S "127.0.0.1:$PORT" -t public >"$TMP/server.log" 2>&1 &
SERVER=$!
SERVER2=; SERVER3=; MOCK_PID=
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$TMP"' EXIT
for _ in $(seq 1 30); do
  curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/index.html" && break
  sleep 0.2
done

BASE="http://127.0.0.1:$PORT" python3 tests/api_test.py

# Asistente con IA: modelo simulado, un servidor con clave y otro sin clave
python3 tests/mock_llm.py 8097 &
MOCK_PID=$!
trap 'kill $SERVER $MOCK_PID $SERVER2 $SERVER3 2>/dev/null || true; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/chat"
FPS_DB_DRIVER=sqlite FPS_SQLITE_PATH="$DB" FPS_LLM_KEY=test-key FPS_LLM_MODEL=mock-model FPS_LLM_URL="http://127.0.0.1:8097/v1/messages" \
  FPS_CHAT_PER_HOUR=12 FPS_CHAT_DIR="$TMP/chat" php -S 127.0.0.1:8098 -t public >"$TMP/server2.log" 2>&1 &
SERVER2=$!
FPS_DB_DRIVER=sqlite FPS_SQLITE_PATH="$DB" php -S 127.0.0.1:8096 -t public >"$TMP/server3.log" 2>&1 &
SERVER3=$!
for _ in $(seq 1 30); do
  curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:8098/index.html" && curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:8096/index.html" && curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:8097/last" && break
  sleep 0.2
done
BASE="http://127.0.0.1:8098" BASE_OFF="http://127.0.0.1:8096" MOCK="http://127.0.0.1:8097" python3 tests/llm_test.py

# Compatibilidad y consumo: usa el catálogo real de la API
curl -s --noproxy '*' "http://127.0.0.1:$PORT/api/catalog.php" > "$TMP/catalog.json"
node tests/compat_test.js "$TMP/catalog.json"
