-- =====================================================
-- TABLAS PARA SOLCOM AI
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Tabla de Claves de API
CREATE TABLE IF NOT EXISTS ai_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key VARCHAR(50) NOT NULL,
    full_key TEXT,
    status VARCHAR(20) DEFAULT 'active',
    tokens_used BIGINT DEFAULT 0,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Asistentes IA
CREATE TABLE IF NOT EXISTS ai_assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capabilities JSONB DEFAULT '{"text": true, "inventory": false, "sales": false}',
    system_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Logs de Uso
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES ai_api_keys(id) ON DELETE SET NULL,
    assistant_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,
    tokens INT NOT NULL DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,
    request_type VARCHAR(50),
    user_message TEXT,
    assistant_response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_api_key ON ai_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_status ON ai_api_keys(status);

-- Habilitar RLS (Row Level Security)
ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso (permitir todo para usuarios autenticados)
CREATE POLICY "Allow all for authenticated users" ON ai_api_keys
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON ai_assistants
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON ai_usage_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insertar un asistente de ejemplo
INSERT INTO ai_assistants (name, description, capabilities) VALUES
('Mía - Asistente de Compras', 'Analiza inventario y recomienda qué productos comprar', '{"text": true, "inventory": true, "sales": true}')
ON CONFLICT DO NOTHING;
