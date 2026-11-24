<?php
declare(strict_types=1);

// Cabeceras comunes a todas las respuestas de la API.
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

/**
 * Configuración: valores por defecto, luego ../../config.php (fuera de la
 * carpeta pública) y por último variables de entorno FPS_*.
 */
function config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $cfg = [
        'driver'      => 'mysql',
        'host'        => '127.0.0.1',
        'port'        => 3306,
        'name'        => 'comparador_fps',
        'user'        => '',
        'pass'        => '',
        'ssl_ca'      => '',
        'sqlite_path' => '',
        'salt'        => 'cambia-esta-sal',
        // Asistente con IA (opcional). Sin clave, el chat usa solo sus reglas.
        'llm_key'       => '',
        'llm_model'     => 'claude-haiku-5-5',
        'llm_url'       => 'https://api.anthropic.com/v1/messages',
        'chat_per_hour' => 40,
        'chat_per_day'  => 600,
        'chat_dir'      => '',
    ];
    $file = __DIR__ . '/../../config.php';
    if (is_file($file)) {
        $cfg = array_merge($cfg, (array) require $file);
    }
    $env = [
        'driver' => 'FPS_DB_DRIVER', 'host' => 'FPS_DB_HOST', 'port' => 'FPS_DB_PORT',
        'name' => 'FPS_DB_NAME', 'user' => 'FPS_DB_USER', 'pass' => 'FPS_DB_PASS',
        'ssl_ca' => 'FPS_DB_SSL_CA', 'sqlite_path' => 'FPS_SQLITE_PATH', 'salt' => 'FPS_SALT',
        'llm_key' => 'FPS_LLM_KEY', 'llm_model' => 'FPS_LLM_MODEL', 'llm_url' => 'FPS_LLM_URL',
        'chat_per_hour' => 'FPS_CHAT_PER_HOUR', 'chat_per_day' => 'FPS_CHAT_PER_DAY', 'chat_dir' => 'FPS_CHAT_DIR',
    ];
    foreach ($env as $key => $var) {
        $value = getenv($var);
        if ($value === false || $value === '') {
            $value = $_SERVER[$var] ?? false;
        }
        if ($value !== false && $value !== '') {
            $cfg[$key] = $value;
        }
    }
    return $cfg;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = config();
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    if ($c['driver'] === 'sqlite') {
        $pdo = new PDO('sqlite:' . $c['sqlite_path'], null, null, $options);
    } else {
        if ($c['ssl_ca'] !== '') {
            $options[PDO::MYSQL_ATTR_SSL_CA] = $c['ssl_ca'];
        }
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int) $c['port'], $c['name']);
        $pdo = new PDO($dsn, (string) $c['user'], (string) $c['pass'], $options);
    }
    return $pdo;
}

function json_out(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): never
{
    json_out($status, ['error' => $message]);
}

/** Ejecuta el manejador y convierte cualquier excepción en un 500 sin detalles. */
function guarded(callable $handler): void
{
    try {
        $handler();
    } catch (Throwable $e) {
        error_log('[comparador-fps] ' . $e->getMessage());
        fail(500, 'Error interno del servidor');
    }
}
