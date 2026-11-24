<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/engine.php';

/*
 * Comparaciones guardadas.
 *   GET    /api/builds.php?code=abcd2345         una comparación
 *   GET    /api/builds.php?recent=1              las últimas públicas
 *   POST   /api/builds.php  (JSON)               guarda una comparación
 *   DELETE /api/builds.php?code=..&token=..      borra con el token que entregó el POST
 */

const BUILD_SELECT = 'SELECT b.code, b.title, b.res, b.quality, b.upscale, b.rt, b.fg, b.ram_a, b.ram_b, b.created_at,
        ca.slug AS cpu_a, ca.name AS cpu_a_name, ga.slug AS gpu_a, ga.name AS gpu_a_name,
        cb.slug AS cpu_b, cb.name AS cpu_b_name, gb.slug AS gpu_b, gb.name AS gpu_b_name
    FROM builds b
    JOIN cpus ca ON ca.id = b.cpu_a_id
    JOIN gpus ga ON ga.id = b.gpu_a_id
    LEFT JOIN cpus cb ON cb.id = b.cpu_b_id
    LEFT JOIN gpus gb ON gb.id = b.gpu_b_id';

const MAX_PER_HOUR = 30;
const MAX_BODY_BYTES = 4096;

function build_to_json(array $r): array
{
    $b = null;
    if ($r['cpu_b'] !== null) {
        $b = ['cpu' => $r['cpu_b'], 'gpu' => $r['gpu_b'], 'ram' => (int) $r['ram_b'],
              'cpu_name' => $r['cpu_b_name'], 'gpu_name' => $r['gpu_b_name']];
    }
    return [
        'code'       => $r['code'],
        'title'      => $r['title'],
        'settings'   => ['res' => (int) $r['res'], 'q' => $r['quality'], 'up' => (int) $r['upscale'],
                         'rt' => (int) $r['rt'] === 1, 'fg' => (int) $r['fg'] === 1],
        'a'          => ['cpu' => $r['cpu_a'], 'gpu' => $r['gpu_a'], 'ram' => (int) $r['ram_a'],
                         'cpu_name' => $r['cpu_a_name'], 'gpu_name' => $r['gpu_a_name']],
        'b'          => $b,
        'created_at' => $r['created_at'],
    ];
}

function valid_code(mixed $code): bool
{
    return is_string($code) && preg_match('/^[a-z2-9]{8}$/', $code) === 1;
}

function new_code(): string
{
    $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    $code = '';
    for ($i = 0; $i < 8; $i++) {
        $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $code;
}

function clean_title(mixed $title): ?string
{
    if (!is_string($title)) {
        return null;
    }
    $title = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $title) ?? '');
    if ($title === '') {
        return null;
    }
    return mb_substr($title, 0, 40);
}

function handle_get(): void
{
    $pdo = db();
    if (isset($_GET['recent'])) {
        $rows = $pdo->query(BUILD_SELECT . ' WHERE b.is_public = 1 ORDER BY b.id DESC LIMIT 8')->fetchAll();
        json_out(200, ['builds' => array_map('build_to_json', $rows)]);
    }
    $code = $_GET['code'] ?? null;
    if (!valid_code($code)) {
        fail(422, 'Código inválido');
    }
    $st = $pdo->prepare(BUILD_SELECT . ' WHERE b.code = ?');
    $st->execute([$code]);
    $row = $st->fetch();
    if (!$row) {
        fail(404, 'No existe esa comparación');
    }
    json_out(200, build_to_json($row));
}

function handle_post(): void
{
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        fail(413, 'Cuerpo demasiado grande');
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        fail(422, 'El cuerpo debe ser JSON');
    }
    $settings = parse_settings($body);
    $a = parse_rig($body, 'a', true);
    $b = parse_rig($body, 'b', false);
    $title = clean_title($body['title'] ?? null);
    $isPublic = !empty($body['public']) ? 1 : 0;

    $pdo = db();
    $ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . config()['salt']);
    $st = $pdo->prepare('SELECT COUNT(*) FROM builds WHERE ip_hash = ? AND created_at > ?');
    $st->execute([$ipHash, gmdate('Y-m-d H:i:s', time() - 3600)]);
    if ((int) $st->fetchColumn() >= MAX_PER_HOUR) {
        fail(429, 'Demasiadas comparaciones guardadas. Intenta más tarde.');
    }

    $cpuA = find_part('cpus', $a['cpu']);
    $gpuA = find_part('gpus', $a['gpu']);
    $cpuB = $b ? find_part('cpus', $b['cpu']) : null;
    $gpuB = $b ? find_part('gpus', $b['gpu']) : null;

    $check = $pdo->prepare('SELECT 1 FROM builds WHERE code = ?');
    for ($tries = 0; ; $tries++) {
        $code = new_code();
        $check->execute([$code]);
        if (!$check->fetchColumn()) {
            break;
        }
        if ($tries >= 5) {
            throw new RuntimeException('No se pudo generar un código único');
        }
    }
    $token = bin2hex(random_bytes(16));

    $ins = $pdo->prepare(
        'INSERT INTO builds (code, title, is_public, cpu_a_id, gpu_a_id, ram_a, cpu_b_id, gpu_b_id, ram_b,
                             res, quality, upscale, rt, fg, delete_hash, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([
        $code, $title, $isPublic,
        $cpuA['id'], $gpuA['id'], $a['ram'],
        $cpuB['id'] ?? null, $gpuB['id'] ?? null, $b['ram'] ?? null,
        $settings['res'], $settings['q'], $settings['up'], $settings['rt'] ? 1 : 0, $settings['fg'] ? 1 : 0,
        hash('sha256', $token), $ipHash, gmdate('Y-m-d H:i:s'),
    ]);
    json_out(201, ['code' => $code, 'delete_token' => $token]);
}

function handle_delete(): void
{
    $code = $_GET['code'] ?? null;
    $token = $_GET['token'] ?? null;
    if (!valid_code($code) || !is_string($token) || !preg_match('/^[a-f0-9]{32}$/', $token)) {
        fail(422, 'Código o token inválido');
    }
    $st = db()->prepare('DELETE FROM builds WHERE code = ? AND delete_hash = ?');
    $st->execute([$code, hash('sha256', $token)]);
    if ($st->rowCount() !== 1) {
        fail(404, 'No existe esa comparación o el token no coincide');
    }
    json_out(200, ['deleted' => true]);
}

guarded(function () {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            handle_get();
            break;
        case 'POST':
            handle_post();
            break;
        case 'DELETE':
            handle_delete();
            break;
        default:
            header('Allow: GET, POST, DELETE');
            fail(405, 'Método no permitido');
    }
});
