-- Agregar columnas faltantes a la tabla routes
-- Ejecutar este script en Supabase SQL Editor

-- Verificar si las columnas existen antes de agregarlas
DO $$ 
BEGIN
    -- Agregar driver_name si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'driver_name'
    ) THEN
        ALTER TABLE routes ADD COLUMN driver_name TEXT;
    END IF;

    -- Agregar driver_phone si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'driver_phone'
    ) THEN
        ALTER TABLE routes ADD COLUMN driver_phone TEXT;
    END IF;

    -- Agregar vehicle_label si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'vehicle_label'
    ) THEN
        ALTER TABLE routes ADD COLUMN vehicle_label TEXT;
    END IF;

    -- Agregar origin_lat si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'origin_lat'
    ) THEN
        ALTER TABLE routes ADD COLUMN origin_lat DOUBLE PRECISION;
    END IF;

    -- Agregar origin_lng si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'origin_lng'
    ) THEN
        ALTER TABLE routes ADD COLUMN origin_lng DOUBLE PRECISION;
    END IF;

    -- Agregar return_to_origin si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'return_to_origin'
    ) THEN
        ALTER TABLE routes ADD COLUMN return_to_origin BOOLEAN DEFAULT false;
    END IF;

    -- Agregar tracking_token si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'tracking_token'
    ) THEN
        ALTER TABLE routes ADD COLUMN tracking_token TEXT UNIQUE;
    END IF;

    -- Agregar tracking_enabled si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'routes' AND column_name = 'tracking_enabled'
    ) THEN
        ALTER TABLE routes ADD COLUMN tracking_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Verificar las columnas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'routes'
ORDER BY ordinal_position;
