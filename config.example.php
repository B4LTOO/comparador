<?php
// Copia este archivo a /var/www/comparador-fps/config.php (UN nivel sobre public/),
// así queda fuera de la carpeta que Apache publica. No lo subas a Git.
return [
    'driver' => 'mysql',
    'host'   => 'tu-instancia.xxxxxxxx.us-east-1.rds.amazonaws.com',
    'port'   => 3306,
    'name'   => 'comparador_fps',
    'user'   => 'fps_app',
    'pass'   => 'cambia-esta-clave',
    'ssl_ca' => '',                      // ruta al global-bundle.pem de RDS si exiges TLS
    'salt'   => 'una-cadena-larga-al-azar',
    // Asistente con IA (opcional). La clave se pide en https://console.anthropic.com y nunca llega al navegador.
    'llm_key'   => '',
    'llm_model' => 'claude-haiku-5-5',   // más rápido y barato; 'claude-sonnet-5-5' responde con más calidad
];
