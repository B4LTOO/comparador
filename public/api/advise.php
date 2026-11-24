<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/engine.php';

/*
 * GET /api/advise.php?cpu_a=..&gpu_a=..&ram_a=16[&cpu_b=..&gpu_b=..&ram_b=16]
 *                    &res=1080&q=high&up=0&rt=0&fg=0[&tag=comp|ex]
 *
 * Para cada equipo prueba cambiar solo el procesador o solo la tarjeta por piezas
 * más potentes del catálogo y devuelve cuánto subiría el promedio de FPS.
 */

function by_slug(array $rows, string $slug): array
{
    foreach ($rows as $row) {
        if ($row['slug'] === $slug) {
            return $row;
        }
    }
    fail(422, 'Pieza desconocida: ' . $slug);
}

guarded(function () {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        fail(405, 'Método no permitido');
    }
    $settings = parse_settings($_GET);
    $rigsIn = ['a' => parse_rig($_GET, 'a', true), 'b' => parse_rig($_GET, 'b', false)];
    $tag = $_GET['tag'] ?? '';
    if (!in_array($tag, ['', 'comp', 'ex'], true)) {
        fail(422, 'Tipo de juego inválido');
    }

    $pdo = db();
    $games = $pdo->query('SELECT ' . GAME_COLUMNS . ' FROM games ORDER BY id')->fetchAll();
    if ($tag !== '') {
        $games = array_values(array_filter($games, static fn($g) => $g['tag'] === $tag));
    }
    $cpus = $pdo->query('SELECT id, slug, name, score FROM cpus ORDER BY score')->fetchAll();
    $gpus = $pdo->query("SELECT id, slug, name, score, vram_gb, rt_perf FROM gpus WHERE brand <> 'Integrada' ORDER BY score")->fetchAll();
    $allGpus = $pdo->query('SELECT id, slug, name, score, vram_gb, rt_perf FROM gpus')->fetchAll();

    $out = [];
    foreach ($rigsIn as $key => $rig) {
        if ($rig === null) {
            continue;
        }
        $cpu = by_slug($cpus, $rig['cpu']);
        $gpu = by_slug($allGpus, $rig['gpu']);
        $baseline = average_fps($games, $cpu, $gpu, $rig['ram'], $settings);

        $gain = static fn(float $avg) => $baseline > 0 ? round(($avg / $baseline - 1) * 100, 1) : 0.0;

        $cpuBetter = array_values(array_filter($cpus, static fn($c) => $c['score'] > $cpu['score'] * 1.08));
        $gpuBetter = array_values(array_filter($gpus, static fn($g) => $g['score'] > $gpu['score'] * 1.08));

        $cpuOptions = [];
        foreach (pick_candidates($cpuBetter) as $c) {
            $avg = average_fps($games, $c, $gpu, $rig['ram'], $settings);
            $cpuOptions[] = ['slug' => $c['slug'], 'name' => $c['name'], 'avg' => round($avg, 1), 'gain' => $gain($avg)];
        }
        $gpuOptions = [];
        foreach (pick_candidates($gpuBetter) as $g) {
            $avg = average_fps($games, $cpu, $g, $rig['ram'], $settings);
            $gpuOptions[] = ['slug' => $g['slug'], 'name' => $g['name'], 'avg' => round($avg, 1), 'gain' => $gain($avg)];
        }
        $out[$key] = ['baseline' => round($baseline, 1), 'cpu' => $cpuOptions, 'gpu' => $gpuOptions];
    }
    json_out(200, ['games' => count($games), 'rigs' => $out]);
});
