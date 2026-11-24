<?php
declare(strict_types=1);

const RES_FACTORS = [1080 => 1.0, 1440 => 1.78, 3440 => 2.39, 2160 => 4.0];   // píxeles relativos a 1080p (3440 = 3440x1440)
const QUALITY_FACTORS = ['low' => 1.5, 'mid' => 1.22, 'high' => 1.0, 'ultra' => 0.8];
const RAM_OPTIONS = [8, 16, 32];
const UPSCALE_GAIN = [0 => 0.0, 1 => 0.35, 2 => 0.55, 3 => 0.80];             // apagado, calidad, equilibrado, rendimiento
const UPSCALE_RES_WEIGHT = [1080 => 0.7, 1440 => 0.9, 3440 => 1.0, 2160 => 1.0]; // el escalado ayuda menos en 1080p

/**
 * Estima los FPS de un juego con un procesador, una tarjeta y cierta RAM.
 *
 * Cada pieza tiene un tope propio: la GPU rinde según su puntaje, la resolución,
 * la calidad, el trazado de rayos y el escalado; la CPU según su puntaje. El
 * resultado es la mezcla suave de ambos topes, así el cuello de botella pesa más
 * cuanto más se aleja del otro. La generación de fotogramas multiplica lo que se
 * ve en pantalla, pero no la capacidad real de las piezas.
 *
 * $s trae res, q, up (0 a 3), rt y fg ya validados por parse_settings().
 */
function estimate_game(array $game, array $cpu, array $gpu, int $ram, array $s): array
{
    $res = $s['res'];
    $resK = (float) $game['res_k'];
    $qualK = (float) $game['qual_k'];

    $gpuCap = (float) $game['gpu_base'] * ((int) $gpu['score'] / 100)
        * (RES_FACTORS[$res] ** -$resK)
        * (QUALITY_FACTORS[$s['q']] ** $qualK);
    $rtK = (float) $game['rt_k'];
    if ($s['rt'] && $rtK > 0) {
        $gpuCap *= ((float) $gpu['rt_perf']) ** $rtK;
    }
    if ($s['up'] > 0 && (int) $game['upscaling'] === 1) {
        $gpuCap *= 1 + UPSCALE_GAIN[$s['up']] * $resK * UPSCALE_RES_WEIGHT[$res];
    }
    if ((int) $gpu['vram_gb'] <= 8) {
        // las tarjetas de 8 GB se ahogan en resoluciones altas
        $gpuCap *= $res === 2160 ? 0.75 : ($res === 3440 ? 0.9 : 1.0);
    }
    $cpuCap = (float) $game['cpu_base'] * ((int) $cpu['score'] / 100);

    $fps = (($gpuCap ** -4) + ($cpuCap ** -4)) ** -0.25;
    if ($ram <= 8) {
        $fps *= 1 - (float) $game['ram_sens'];
    }
    $capped = false;
    if ($game['fps_cap'] !== null && $fps > (int) $game['fps_cap']) {
        $fps = (float) $game['fps_cap'];
        $capped = true;
    }

    $ratio = $gpuCap / $cpuCap;
    $limit = $capped ? 'cap' : ($ratio > 1.15 ? 'cpu' : ($ratio < 0.87 ? 'gpu' : 'eq'));
    $lowRatio = ['cpu' => 0.62, 'gpu' => 0.78, 'eq' => 0.70, 'cap' => 0.90][$limit];
    if ($ram <= 8) {
        $lowRatio *= 0.7;
    }

    $base = $fps;
    $mult = 1.0;
    if ($s['fg'] && (int) $game['fg'] === 1 && !$capped) {
        $mult = $base >= 60 ? 1.75 : ($base >= 40 ? 1.6 : 1.3);   // con pocos FPS reales la generación rinde menos
    }

    return [
        'fps'      => round($base * $mult, 1),
        'base_fps' => round($base, 1),
        'low'      => round($base * $mult * $lowRatio, 1),
        'fg'       => $mult > 1.0,
        'lim'      => $limit,
        'gpu_cap'  => round($gpuCap, 1),
        'cpu_cap'  => round($cpuCap, 1),
        'gpu_use'  => (int) round(min(1.0, $base / $gpuCap) * 100),
        'cpu_use'  => (int) round(min(1.0, $base / $cpuCap) * 100),
    ];
}

/** FPS promedio de una lista de juegos con una combinación de piezas. */
function average_fps(array $games, array $cpu, array $gpu, int $ram, array $s): float
{
    if (!$games) {
        return 0.0;
    }
    $sum = 0.0;
    foreach ($games as $game) {
        $sum += estimate_game($game, $cpu, $gpu, $ram, $s)['fps'];
    }
    return $sum / count($games);
}

/** Lee y valida un equipo (cpu_x, gpu_x, ram_x) de $_GET o del cuerpo JSON. */
function parse_rig(array $src, string $suffix, bool $required): ?array
{
    $cpu = $src['cpu_' . $suffix] ?? null;
    $gpu = $src['gpu_' . $suffix] ?? null;
    $empty = static fn($v) => $v === null || $v === '';
    if (!$required && $empty($cpu) && $empty($gpu)) {
        return null;
    }
    foreach (['cpu_' . $suffix => $cpu, 'gpu_' . $suffix => $gpu] as $key => $value) {
        if (!is_string($value) || !preg_match('/^[a-z0-9-]{1,60}$/', $value)) {
            fail(422, 'Parámetro inválido: ' . $key);
        }
    }
    $ram = $src['ram_' . $suffix] ?? 16;
    if (is_string($ram) && ctype_digit($ram)) {
        $ram = (int) $ram;
    }
    if (!is_int($ram) || !in_array($ram, RAM_OPTIONS, true)) {
        fail(422, 'RAM inválida: usa 8, 16 o 32');
    }
    return ['cpu' => $cpu, 'gpu' => $gpu, 'ram' => $ram];
}

function flag(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1';
}

/** Lee y valida resolución, calidad, escalado, trazado de rayos y generación de fotogramas. */
function parse_settings(array $src): array
{
    $res = $src['res'] ?? 1080;
    if (is_string($res) && ctype_digit($res)) {
        $res = (int) $res;
    }
    if (!is_int($res) || !isset(RES_FACTORS[$res])) {
        fail(422, 'Resolución inválida: usa 1080, 1440, 3440 o 2160');
    }
    $quality = $src['q'] ?? 'high';
    if (!is_string($quality) || !isset(QUALITY_FACTORS[$quality])) {
        fail(422, 'Calidad inválida: usa low, mid, high o ultra');
    }
    $up = $src['up'] ?? 0;
    if (is_bool($up)) {
        $up = $up ? 1 : 0;
    }
    if (is_string($up) && ctype_digit($up)) {
        $up = (int) $up;
    }
    if (!is_int($up) || !isset(UPSCALE_GAIN[$up])) {
        fail(422, 'Escalado inválido: usa 0, 1, 2 o 3');
    }
    return ['res' => $res, 'q' => $quality, 'up' => $up, 'rt' => flag($src['rt'] ?? 0), 'fg' => flag($src['fg'] ?? 0)];
}

/** Busca una pieza por slug. $table es una constante interna, nunca entrada del usuario. */
function find_part(string $table, string $slug): array
{
    if (!in_array($table, ['cpus', 'gpus'], true)) {
        throw new LogicException('Tabla no permitida');
    }
    $columns = $table === 'cpus' ? 'id, slug, name, score' : 'id, slug, name, score, vram_gb, rt_perf';
    $st = db()->prepare("SELECT $columns FROM $table WHERE slug = ?");
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) {
        fail(422, 'Pieza desconocida: ' . $slug);
    }
    return $row;
}

/** Elige hasta 4 candidatos repartidos entre una mejora pequeña y la más potente. */
function pick_candidates(array $sorted): array
{
    $n = count($sorted);
    if ($n <= 4) {
        return $sorted;
    }
    $idx = array_unique([(int) floor($n * 0.10), (int) floor($n * 0.35), (int) floor($n * 0.65), $n - 1]);
    return array_map(static fn($i) => $sorted[$i], $idx);
}

const GAME_COLUMNS = 'slug, name, tag, gpu_base, cpu_base, res_k, qual_k, upscaling, fps_cap, ram_sens, source, rt_k, fg';
