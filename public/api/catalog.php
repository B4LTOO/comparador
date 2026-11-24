<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

guarded(function () {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        fail(405, 'Método no permitido');
    }
    $pdo = db();
    $cpus = $pdo->query('SELECT slug, name, brand, source FROM cpus ORDER BY brand, score')->fetchAll();
    $gpus = $pdo->query('SELECT slug, name, brand, vram_gb, source FROM gpus ORDER BY brand, score')->fetchAll();
    $games = $pdo->query('SELECT slug, name, tag, source FROM games ORDER BY id')->fetchAll();

    header('Cache-Control: public, max-age=300');
    json_out(200, ['cpus' => $cpus, 'gpus' => $gpus, 'games' => $games]);
});
