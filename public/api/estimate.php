<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/engine.php';

/*
 * GET /api/estimate.php?cpu_a=..&gpu_a=..&ram_a=16[&cpu_b=..&gpu_b=..&ram_b=16]
 *                      &res=1080&q=high&up=0&rt=0&fg=0
 * Devuelve los FPS estimados de todos los juegos para uno o dos equipos.
 */
guarded(function () {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        fail(405, 'Método no permitido');
    }
    $settings = parse_settings($_GET);
    $rigsIn = ['a' => parse_rig($_GET, 'a', true), 'b' => parse_rig($_GET, 'b', false)];

    $rigs = [];
    foreach ($rigsIn as $key => $rig) {
        if ($rig === null) {
            continue;
        }
        $rigs[$key] = $rig + [
            'cpu_row' => find_part('cpus', $rig['cpu']),
            'gpu_row' => find_part('gpus', $rig['gpu']),
        ];
    }

    $games = db()->query('SELECT ' . GAME_COLUMNS . ' FROM games ORDER BY id')->fetchAll();

    $out = [];
    foreach ($games as $game) {
        $row = [
            'slug' => $game['slug'], 'name' => $game['name'], 'tag' => $game['tag'], 'source' => $game['source'],
            'feat' => ['up' => (int) $game['upscaling'] === 1, 'rt' => (float) $game['rt_k'] > 0, 'fg' => (int) $game['fg'] === 1],
        ];
        foreach ($rigs as $key => $rig) {
            $row[$key] = estimate_game($game, $rig['cpu_row'], $rig['gpu_row'], $rig['ram'], $settings);
        }
        $out[] = $row;
    }

    $summary = [];
    foreach ($rigs as $key => $rig) {
        $summary[$key] = ['cpu' => $rig['cpu_row']['name'], 'gpu' => $rig['gpu_row']['name'], 'ram' => $rig['ram']];
    }
    json_out(200, ['settings' => $settings, 'rigs' => $summary, 'games' => $out]);
});
