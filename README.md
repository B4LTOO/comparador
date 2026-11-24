# ArmaTuRig (comparador de FPS)

Página web que estima los FPS de dos PCs en 22 juegos según resolución (incluida 3440×1440), calidad, escalado DLSS/FSR en tres modos, trazado de rayos, generación de fotogramas y RAM, y muestra qué pieza (CPU o GPU) hace de cuello de botella. Las piezas, los juegos y las comparaciones guardadas viven en MySQL; el cálculo lo hace el backend en PHP.

```
Navegador ──► Apache2 (EC2) ──► PHP (api/*.php) ──► RDS MySQL
                 │
                 └─ index.html + assets/ (sin dependencias, sin build)
```

## Estructura

| Ruta | Qué es |
|---|---|
| `public/` | Lo único que Apache publica (`index.html`, `assets/`, `api/`) |
| `public/api/catalog.php` | `GET` piezas y juegos para llenar los selectores |
| `public/api/estimate.php` | `GET` FPS estimados de los 22 juegos para el PC A y, si se pide, el PC B |
| `public/api/advise.php` | `GET` prueba cambiar solo la CPU o solo la GPU por piezas más potentes y devuelve cuánto sube el promedio de FPS |
| `public/api/builds.php` | `POST` guarda una comparación, `GET` la lee o lista las recientes, `DELETE` la borra con su token |
| `public/assets/compat.js` | Socket, memoria DDR4/DDR5, consumo y fuente recomendada, todo deducido del nombre de la pieza (aproximado) |
| `public/assets/shop.js` | Precios que escribe el usuario, costo por FPS, lista de compras con total y presupuesto (se guarda en el navegador) |
| `public/assets/parts.js` | Ilustraciones SVG de tarjetas de video y procesadores según marca, memoria y familia (son dibujos, no fotos de producto) |
| `public/assets/chat.js` | El asistente Byte: con reglas cambia ajustes y dibuja gráficos con los datos; si el servidor tiene IA activada, las preguntas abiertas van a `api/chat.php` |
| `public/api/chat.php` | Proxy hacia la API de Anthropic: la clave vive solo en el servidor y el contexto (FPS, cuellos de botella, mejoras) lo calcula el servidor |
| `public/api/engine.php` | El modelo de estimación |
| `sql/schema.sql`, `sql/seed.sql` | Tablas y datos (53 CPUs, 62 GPUs, 22 juegos) |
| `tools/build_seed.py` | Fuente de los datos; regenera `sql/seed.sql` |
| `config.example.php` | Plantilla de credenciales (se copia fuera de `public/`) |
| `deploy/apache-fps.conf` | Sitio de Apache con cabeceras de seguridad |
| `tools/run_local.py` | Abre la página en tu PC con PHP y SQLite, sin XAMPP |
| `tests/run.sh` | Pruebas de la API en local (no necesita MySQL) |

## Despliegue en EC2 (Ubuntu) + RDS MySQL

1. **Paquetes en la EC2**
   ```bash
   sudo apt update
   sudo apt install -y apache2 php libapache2-mod-php php-mysql mysql-client
   ```
   Hace falta PHP 8.1 o superior.

2. **Base de datos en RDS.** El grupo de seguridad de RDS debe permitir el puerto 3306 desde el grupo de seguridad de la EC2. Luego, desde la EC2:
   ```bash
   mysql -h <endpoint-rds> -u admin -p < sql/schema.sql
   mysql -h <endpoint-rds> -u admin -p comparador_fps < sql/seed.sql
   ```
   Al final de `schema.sql` hay comentado un usuario `fps_app` con permisos mínimos: `SELECT` en las piezas y `SELECT, INSERT, DELETE` en `builds`. Úsalo en lugar del administrador.

3. **Copiar el proyecto**
   ```bash
   sudo mkdir -p /var/www/comparador-fps
   sudo cp -r public sql /var/www/comparador-fps/
   ```

4. **Credenciales, fuera de la carpeta pública**
   ```bash
   sudo cp config.example.php /var/www/comparador-fps/config.php
   sudo nano /var/www/comparador-fps/config.php        # endpoint, usuario, clave y una sal larga
   sudo chown root:www-data /var/www/comparador-fps/config.php
   sudo chmod 640 /var/www/comparador-fps/config.php
   ```
   También se aceptan las variables de entorno `FPS_DB_HOST`, `FPS_DB_NAME`, `FPS_DB_USER`, `FPS_DB_PASS`, `FPS_DB_SSL_CA` y `FPS_SALT`. Si RDS exige TLS, descarga el `global-bundle.pem` de AWS y pon su ruta en `ssl_ca`.

5. **Apache**
   ```bash
   sudo cp deploy/apache-fps.conf /etc/apache2/sites-available/fps.conf
   sudo a2enmod headers
   sudo a2dissite 000-default && sudo a2ensite fps
   sudo systemctl reload apache2
   ```
   Abre `http://<ip-publica-de-la-ec2>/`. Si falla, mira `/var/log/apache2/fps-error.log`.

6. **HTTPS (recomendado).** Con un dominio apuntando a la EC2: `sudo apt install certbot python3-certbot-apache && sudo certbot --apache`.

## Verlo en tu PC, sin XAMPP ni MySQL

Necesitas Python 3 y PHP 8.1 o superior con la extensión `pdo_sqlite`. Desde la carpeta del proyecto:

```bash
python tools/run_local.py
```

Crea una base SQLite en `data/`, levanta el servidor de PHP y abre `http://127.0.0.1:8080/` en el navegador. Para detenerlo, Ctrl+C. Si falta PHP o la extensión, el script dice qué instalar. Esta base es solo para probar: las comparaciones que guardes quedan en `data/local.sqlite`.

## Asesor con IA (opcional)

Con una clave de la API de Anthropic, Byte responde cualquier pregunta de PC y gaming y recomienda como un buen vendedor: pregunta presupuesto, monitor y juegos, propone 1 a 3 opciones con sus pros y contras y dice cuándo no conviene gastar. Sin clave, Byte sigue funcionando con reglas.

1. Crea una clave en https://console.anthropic.com (la API se cobra por uso y es aparte del plan de Claude; el modelo por defecto, `claude-haiku-5-5`, es el económico).
2. Local: `$env:FPS_LLM_KEY="tu-clave"` (PowerShell) antes de `python tools/run_local.py`, o guárdala sola en `data/llm_key.txt`. En Windows el script activa curl y openssl y baja `data/cacert.pem` solo.
3. Servidor: `llm_key` en `config.php` (o la variable `FPS_LLM_KEY`). Opcionales: `llm_model`, `chat_per_hour` (40 por IP), `chat_per_day` (600 en total) y `chat_dir`. Requiere la extensión curl de PHP.

Seguridad: la clave nunca llega al navegador; el servidor limita mensajes (IP por hora y total por día), acota el historial (10 mensajes de 700 caracteres) y arma él mismo los datos que ve el modelo. Lo que escribe el usuario no puede cambiar las instrucciones, y las acciones que sugiere el modelo solo aceptan piezas que existen en el catálogo. No se guardan conversaciones.

## Pruebas automáticas

```bash
bash tests/run.sh
```
Levanta el servidor de PHP con una base SQLite que tiene la misma estructura, recalcula los FPS en Python y los compara con los que entrega PHP, y prueba validaciones, guardado, borrado y archivos estáticos.

## Seguridad

- Consultas preparadas en todo acceso a MySQL; los valores se validan contra listas cerradas o contra una expresión regular antes de tocar la base.
- Las credenciales no están en el código ni en `public/`.
- La página arma el DOM sin `innerHTML` y no tiene scripts ni estilos en línea, así que la política CSP de `deploy/apache-fps.conf` puede bloquear todo lo demás. Los títulos que escribe un usuario siempre se muestran como texto.
- Las comparaciones tienen un código aleatorio de 8 caracteres. Solo quien guardó recibe el token de borrado, y la base guarda únicamente su SHA-256.
- Límite de 30 comparaciones por hora por IP (se guarda un hash de la IP con sal, no la IP).
- Las comparaciones son privadas salvo que se marque «Mostrar en recientes».

## De dónde salen los números

- **GPU:** ranking de rendimiento 2026 de Tom's Hardware, 1440p Ultra sin escalado, 11 juegos, con un Ryzen 7 9800X3D (https://www.tomshardware.com/reviews/gpu-hierarchy,4388.html). Se reescala para que la RTX 4060 valga 100.
- **CPU:** ranking de juegos 2026 de Tom's Hardware, 1080p con una RTX 5090 y 17 juegos (https://www.tomshardware.com/reviews/cpu-hierarchy,4312.html). TechSpot mide al Ryzen 7 7800X3D entre 52 % y 72 % por encima del Ryzen 5 5600 (https://www.techspot.com/review/2825-older-ryzen-cpu-fast-modern-gpu/), así que se reescala con el 5600 en 100.
- **Juegos:** FPS de CS2, Warzone, Fortnite, Spider-Man y The Last of Us de la misma nota de TechSpot, y Cyberpunk de su review de la RTX 5060 (https://www.techspot.com/review/2992-nvidia-geforce-rtx-5060/).
- **RAM:** con 16 GB casi no hay diferencia frente a 32 GB, y con 8 GB aparecen tirones en casi todos los juegos (https://www.techspot.com/review/3076-how-much-ram-2026/, https://www.pcgamer.com/hardware/memory/my-testing-shows-that-16-gb-of-system-memory-is-still-absolutely-fine-for-todays-pc-games-but-there-are-some-caveats-to-it-all). El modelo resta FPS promedio y empeora los mínimos con 8 GB.
- Todo lo marcado **«est.»** en la página (piezas más antiguas, algunos juegos y los puntajes de CPU que no estaban en el ranking) es una aproximación mía, no una medición.

Para corregir un valor sin regenerar todo: `UPDATE cpus SET score = 110 WHERE slug = 'core-i5-12400f';`.

## Cómo calcula

Cada pieza tiene un tope de FPS propio. El de la GPU parte de los FPS base del juego, se multiplica por el puntaje de la tarjeta y baja con la resolución y la calidad (DLSS/FSR lo sube en los juegos que lo admiten; las tarjetas de 8 GB pierden un 25 % extra en 4K). El de la CPU es el tope del juego por el puntaje del procesador. El resultado es la mezcla suave de ambos topes, de modo que el cuello de botella pesa más cuanto más se aleja una pieza de la otra. El porcentaje de uso de cada pieza es FPS reales sobre su tope.

**Ajustes nuevos.** El trazado de rayos multiplica el tope de la GPU por `rt_perf ^ rt_k` (cuánto conserva la tarjeta, según su generación, elevado al peso del juego). El escalado sube el tope de la GPU en 35 %, 55 % u 80 % (Calidad, Equilibrado, Rendimiento) por la sensibilidad a la resolución del juego, y ayuda menos en 1080p. La generación de fotogramas multiplica los FPS que se ven (×1,75 si los reales son 60 o más, ×1,6 desde 40, ×1,3 por debajo) solo en juegos compatibles y no sobre el tope del juego; los FPS reales y el cuello de botella no cambian. 3440×1440 cuenta como 2,39 veces los píxeles de 1080p. `rt_perf` y `rt_k` son estimaciones por generación, no mediciones. Un juego puede variar bastante según el mapa, los drivers y la versión.

**Si ya tienes la base en MySQL (RDS):** aplica esto antes de subir los archivos nuevos y vuelve a cargar `sql/seed.sql`:

```sql
ALTER TABLE gpus   ADD COLUMN rt_perf DECIMAL(3,2) NOT NULL DEFAULT 0.50 AFTER vram_gb;
ALTER TABLE games  ADD COLUMN rt_k DECIMAL(3,2) NOT NULL DEFAULT 0.00, ADD COLUMN fg TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE builds MODIFY upscale TINYINT UNSIGNED NOT NULL DEFAULT 0,
                   ADD COLUMN rt TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN fg TINYINT(1) NOT NULL DEFAULT 0;
```

En el modo local no hace falta nada: `run_local.py` guarda una copia de la base vieja y crea una nueva.
