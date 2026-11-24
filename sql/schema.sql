-- Esquema para MySQL 8 / Amazon RDS for MySQL.
-- Uso:  mysql -h <endpoint-rds> -u <usuario> -p < sql/schema.sql
--       mysql -h <endpoint-rds> -u <usuario> -p comparador_fps < sql/seed.sql

CREATE DATABASE IF NOT EXISTS comparador_fps
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE comparador_fps;

CREATE TABLE cpus (
  id     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug   VARCHAR(60)  NOT NULL,
  name   VARCHAR(80)  NOT NULL,
  brand  ENUM('Intel','AMD') NOT NULL,
  score  SMALLINT UNSIGNED NOT NULL COMMENT 'Rendimiento en juegos, Ryzen 5 5600 = 100',
  source ENUM('medido','estimado') NOT NULL DEFAULT 'estimado',
  PRIMARY KEY (id),
  UNIQUE KEY uq_cpus_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE gpus (
  id      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug    VARCHAR(60)  NOT NULL,
  name    VARCHAR(80)  NOT NULL,
  brand   ENUM('NVIDIA','AMD','Intel','Integrada') NOT NULL,
  score   SMALLINT UNSIGNED NOT NULL COMMENT 'Rendimiento relativo, RTX 4060 = 100',
  vram_gb TINYINT UNSIGNED NOT NULL,
  rt_perf DECIMAL(3,2) NOT NULL DEFAULT 0.50 COMMENT 'Fracción del rendimiento que conserva con trazado de rayos',
  source  ENUM('medido','estimado') NOT NULL DEFAULT 'estimado',
  PRIMARY KEY (id),
  UNIQUE KEY uq_gpus_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE games (
  id        SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug      VARCHAR(60)  NOT NULL,
  name      VARCHAR(80)  NOT NULL,
  tag       ENUM('comp','ex') NOT NULL,
  gpu_base  SMALLINT UNSIGNED NOT NULL COMMENT 'FPS en RTX 4060, 1080p, calidad alta',
  cpu_base  SMALLINT UNSIGNED NOT NULL COMMENT 'Tope de FPS en Ryzen 5 5600',
  res_k     DECIMAL(3,2) NOT NULL COMMENT 'Cuánto baja el rendimiento al subir la resolución',
  qual_k    DECIMAL(3,2) NOT NULL COMMENT 'Cuánto cambia con la calidad gráfica',
  upscaling TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Admite DLSS/FSR',
  fps_cap   SMALLINT UNSIGNED NULL COMMENT 'Tope de FPS impuesto por el juego',
  ram_sens  DECIMAL(3,2) NOT NULL DEFAULT 0.05 COMMENT 'Pérdida de FPS con 8 GB de RAM',
  source    ENUM('medido','estimado') NOT NULL DEFAULT 'estimado',
  rt_k      DECIMAL(3,2) NOT NULL DEFAULT 0.00 COMMENT 'Peso del trazado de rayos; 0 = el juego no lo tiene',
  fg        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Admite generación de fotogramas',
  PRIMARY KEY (id),
  UNIQUE KEY uq_games_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE builds (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        CHAR(8)     NOT NULL,
  title       VARCHAR(40) NULL,
  is_public   TINYINT(1)  NOT NULL DEFAULT 0,
  cpu_a_id    SMALLINT UNSIGNED NOT NULL,
  gpu_a_id    SMALLINT UNSIGNED NOT NULL,
  ram_a       TINYINT UNSIGNED  NOT NULL,
  cpu_b_id    SMALLINT UNSIGNED NULL,
  gpu_b_id    SMALLINT UNSIGNED NULL,
  ram_b       TINYINT UNSIGNED  NULL,
  res         SMALLINT UNSIGNED NOT NULL,
  quality     ENUM('low','mid','high','ultra') NOT NULL,
  upscale     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 apagado, 1 calidad, 2 equilibrado, 3 rendimiento',
  rt          TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Trazado de rayos',
  fg          TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Generación de fotogramas',
  delete_hash CHAR(64)    NOT NULL COMMENT 'SHA-256 del token para borrar',
  ip_hash     CHAR(64)    NOT NULL COMMENT 'SHA-256 de IP + sal, solo para limitar abuso',
  created_at  DATETIME    NOT NULL COMMENT 'UTC',
  PRIMARY KEY (id),
  UNIQUE KEY uq_builds_code (code),
  KEY idx_builds_public (is_public, id),
  KEY idx_builds_ip (ip_hash, created_at),
  CONSTRAINT fk_builds_cpu_a FOREIGN KEY (cpu_a_id) REFERENCES cpus (id),
  CONSTRAINT fk_builds_gpu_a FOREIGN KEY (gpu_a_id) REFERENCES gpus (id),
  CONSTRAINT fk_builds_cpu_b FOREIGN KEY (cpu_b_id) REFERENCES cpus (id),
  CONSTRAINT fk_builds_gpu_b FOREIGN KEY (gpu_b_id) REFERENCES gpus (id)
) ENGINE=InnoDB;

-- Usuario de la aplicación con permisos mínimos (cambia la clave):
--   CREATE USER 'fps_app'@'%' IDENTIFIED BY 'cambia-esta-clave';
--   GRANT SELECT ON comparador_fps.cpus  TO 'fps_app'@'%';
--   GRANT SELECT ON comparador_fps.gpus  TO 'fps_app'@'%';
--   GRANT SELECT ON comparador_fps.games TO 'fps_app'@'%';
--   GRANT SELECT, INSERT, DELETE ON comparador_fps.builds TO 'fps_app'@'%';
