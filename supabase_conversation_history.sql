-- =====================================================
-- TABLA PARA HISTORIAL DE CONVERSACIONES DE MÍA
-- Persistencia de conversaciones por usuario
-- =====================================================

-- Crear tabla de historial de conversaciones
CREATE TABLE IF NOT EXISTS conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Email, ID de usuario, o identificador único
    session_id TEXT, -- ID de sesión del navegador
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    image_url TEXT, -- URL de imagen si se adjuntó
    url_analyzed TEXT, -- URL analizada si se adjuntó
    metadata JSONB, -- Datos adicionales (contexto, tokens, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_conversation_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_session_id ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created_at ON conversation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_expires_at ON conversation_history(expires_at);

-- Índice compuesto para consultas por usuario y fecha
CREATE INDEX IF NOT EXISTS idx_conversation_user_created ON conversation_history(user_id, created_at DESC);

-- Función para limpiar conversaciones expiradas (ejecutar diariamente)
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM conversation_history
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener historial de conversación de un usuario
CREATE OR REPLACE FUNCTION get_user_conversation_history(
    p_user_id TEXT,
    p_limit INTEGER DEFAULT 200,
    p_session_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    role TEXT,
    content TEXT,
    image_url TEXT,
    url_analyzed TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ch.id,
        ch.role,
        ch.content,
        ch.image_url,
        ch.url_analyzed,
        ch.created_at
    FROM conversation_history ch
    WHERE ch.user_id = p_user_id
        AND (p_session_id IS NULL OR ch.session_id = p_session_id)
        AND ch.expires_at > NOW()
    ORDER BY ch.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Función para guardar mensaje en historial
CREATE OR REPLACE FUNCTION save_conversation_message(
    p_user_id TEXT,
    p_session_id TEXT,
    p_role TEXT,
    p_content TEXT,
    p_image_url TEXT DEFAULT NULL,
    p_url_analyzed TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO conversation_history (
        user_id,
        session_id,
        role,
        content,
        image_url,
        url_analyzed,
        metadata
    ) VALUES (
        p_user_id,
        p_session_id,
        p_role,
        p_content,
        p_image_url,
        p_url_analyzed,
        p_metadata
    )
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- RLS (Row Level Security) - Opcional pero recomendado
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver sus propias conversaciones
CREATE POLICY "Users can view own conversations"
    ON conversation_history
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

-- Política: Los usuarios pueden insertar sus propias conversaciones
CREATE POLICY "Users can insert own conversations"
    ON conversation_history
    FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Política: Service role puede hacer todo (para el backend)
CREATE POLICY "Service role has full access"
    ON conversation_history
    FOR ALL
    USING (current_setting('role') = 'service_role');

-- Verificar la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'conversation_history'
ORDER BY ordinal_position;

-- Comentarios para documentación
COMMENT ON TABLE conversation_history IS 'Historial de conversaciones de Mía AI por usuario con expiración de 90 días';
COMMENT ON COLUMN conversation_history.user_id IS 'Identificador único del usuario (email, user_id, etc.)';
COMMENT ON COLUMN conversation_history.session_id IS 'ID de sesión del navegador para agrupar conversaciones';
COMMENT ON COLUMN conversation_history.role IS 'Rol del mensaje: user, assistant, o system';
COMMENT ON COLUMN conversation_history.content IS 'Contenido del mensaje';
COMMENT ON COLUMN conversation_history.image_url IS 'URL de imagen adjunta si existe';
COMMENT ON COLUMN conversation_history.url_analyzed IS 'URL analizada si existe';
COMMENT ON COLUMN conversation_history.metadata IS 'Metadatos adicionales en formato JSON';
COMMENT ON COLUMN conversation_history.expires_at IS 'Fecha de expiración (90 días por defecto)';
