-- ============================================================
-- MIGRACIÓN: GEOLOCALIZACIÓN DE ALTA PRECISIÓN PARA CLIENTES
-- ============================================================

-- 1. Añadir columnas a la tabla de clientes
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 2. Actualizar la función del disparador para heredar las coordenadas
CREATE OR REPLACE FUNCTION public.sync_pick_order_to_delivery_job()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_name TEXT;
    v_customer_phone TEXT;
    v_address_text TEXT;
    v_exists BOOLEAN;
    v_priority VARCHAR(20);
    v_lat DOUBLE PRECISION;
    v_lng DOUBLE PRECISION;
BEGIN
    -- Verificar si requiere entrega o es de tipo "libre"
    IF NEW.delivery_requested = true 
       OR NEW.delivery_method IN ('envio', 'delivery', 'reparto', 'domicilio', 'libre')
       OR NEW.delivery_method ILIKE '%envio%' 
       OR NEW.delivery_method ILIKE '%delivery%' 
       OR NEW.delivery_method ILIKE '%reparto%' 
       OR NEW.delivery_method ILIKE '%domicilio%' 
       OR NEW.delivery_method ILIKE '%libre%' 
    THEN
        -- Validar si ya existe un delivery_job para esta orden de venta
        SELECT EXISTS (
            SELECT 1 FROM public.delivery_jobs 
            WHERE (metadata->>'pick_order_id') = NEW.id::text
               OR sales_order_id = NEW.sales_order_number 
               OR (metadata->>'sales_order_id') = NEW.sales_order_id::text
        ) INTO v_exists;

        -- Mapear prioridad (urgent -> high, normal -> normal)
        IF NEW.priority = 'urgent' THEN
            v_priority := 'high';
        ELSE
            v_priority := 'normal';
        END IF;

        IF v_exists THEN
            -- Si ya existe, actualizamos los metadatos con el estado de alistamiento actual
            UPDATE public.delivery_jobs
            SET 
                priority = v_priority,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'pick_order_id', NEW.id,
                    'sales_order_id', NEW.sales_order_id,
                    'warehouse_id', NEW.warehouse_id,
                    'pick_status', NEW.status,
                    'pick_priority', NEW.priority,
                    'delivery_method', NEW.delivery_method,
                    'last_updated_from_picking', now()
                )
            WHERE (metadata->>'pick_order_id') = NEW.id::text
               OR sales_order_id = NEW.sales_order_number 
               OR (metadata->>'sales_order_id') = NEW.sales_order_id::text;
        ELSE
            -- Obtener detalles del cliente y dirección, incluyendo coordenadas
            SELECT 
                COALESCE(name, 'Cliente Desconocido'), 
                COALESCE(phone, ''), 
                COALESCE(address, 'Dirección no especificada'),
                lat,
                lng
            INTO v_customer_name, v_customer_phone, v_address_text, v_lat, v_lng
            FROM public.customers
            WHERE id = NEW.customer_id;

            -- Si no se encuentra información, establecer valores por defecto
            IF v_customer_name IS NULL THEN
                v_customer_name := 'Cliente Desconocido';
                v_customer_phone := '';
                v_address_text := 'Dirección no especificada';
                v_lat := NULL;
                v_lng := NULL;
            END IF;

            -- Insertar el registro en delivery_jobs
            INSERT INTO public.delivery_jobs (
                sales_order_id,
                customer_name,
                customer_phone,
                status,
                priority,
                address_text,
                lat,
                lng,
                zone_id,
                weight,
                volume,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                NEW.sales_order_number,
                v_customer_name,
                v_customer_phone,
                'pending',
                v_priority,
                v_address_text,
                v_lat, -- Latitud heredada de la ficha del cliente
                v_lng, -- Longitud heredada de la ficha del cliente
                'managua-centro', -- Zona por defecto
                NEW.total, -- Heurística de peso basada en el total para demo/indicador
                0.0,
                jsonb_build_object(
                    'pick_order_id', NEW.id,
                    'sales_order_id', NEW.sales_order_id,
                    'warehouse_id', NEW.warehouse_id,
                    'pick_status', NEW.status,
                    'pick_priority', NEW.priority,
                    'delivery_method', NEW.delivery_method,
                    'sync_source', 'trigger_warehouse_pick_orders',
                    'last_updated_from_picking', now()
                ),
                now(),
                now()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Forzar recarga de cache de PostgREST
NOTIFY pgrst, 'reload schema';
