-- ============================================================
-- Sistema de Créditos de IA para Solcom
-- ============================================================

-- Tabla para el balance de créditos (una sola fila global)
CREATE TABLE IF NOT EXISTS ai_credit_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar balance inicial si no existe
INSERT INTO ai_credit_balance (balance)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM ai_credit_balance);

-- Tabla para historial de transacciones de créditos
CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount BIGINT NOT NULL, -- Positivo = compra, Negativo = consumo
  balance_after BIGINT NOT NULL,
  transaction_type TEXT NOT NULL, -- 'purchase', 'usage', 'adjustment'
  package_id TEXT, -- ID del paquete comprado (si aplica)
  reference TEXT, -- Referencia de pago o ID de consulta
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON ai_credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON ai_credit_transactions(transaction_type);

-- Función para registrar transacción y actualizar balance
CREATE OR REPLACE FUNCTION process_credit_transaction(
  p_amount BIGINT,
  p_type TEXT,
  p_package_id TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance BIGINT, transaction_id UUID) AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
  v_transaction_id UUID;
BEGIN
  -- Obtener balance actual
  SELECT balance INTO v_current_balance FROM ai_credit_balance LIMIT 1;
  
  -- Calcular nuevo balance
  v_new_balance := v_current_balance + p_amount;
  
  -- No permitir balance negativo
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Balance insuficiente. Balance actual: %, Monto solicitado: %', v_current_balance, ABS(p_amount);
  END IF;
  
  -- Actualizar balance
  UPDATE ai_credit_balance SET balance = v_new_balance, updated_at = NOW();
  
  -- Registrar transacción
  INSERT INTO ai_credit_transactions (amount, balance_after, transaction_type, package_id, reference, notes)
  VALUES (p_amount, v_new_balance, p_type, p_package_id, p_reference, p_notes)
  RETURNING id INTO v_transaction_id;
  
  -- Retornar nuevo balance y ID de transacción
  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Función para consumir créditos (llamada desde el webhook)
CREATE OR REPLACE FUNCTION consume_credits(
  p_tokens BIGINT,
  p_reference TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Consumir créditos (negativo)
  SELECT * INTO v_result FROM process_credit_transaction(
    -p_tokens,
    'usage',
    NULL,
    p_reference,
    'Consumo automático de IA'
  );
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Si falla (balance insuficiente), retornar false
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Vista para estadísticas de créditos
CREATE OR REPLACE VIEW ai_credit_stats AS
SELECT
  (SELECT balance FROM ai_credit_balance LIMIT 1) as current_balance,
  (SELECT SUM(amount) FROM ai_credit_transactions WHERE transaction_type = 'purchase') as total_purchased,
  (SELECT SUM(ABS(amount)) FROM ai_credit_transactions WHERE transaction_type = 'usage') as total_consumed,
  (SELECT COUNT(*) FROM ai_credit_transactions WHERE transaction_type = 'purchase') as total_purchases,
  (SELECT COUNT(*) FROM ai_credit_transactions WHERE transaction_type = 'usage') as total_usages;

-- Políticas RLS (Row Level Security)
ALTER TABLE ai_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a todos los usuarios autenticados
CREATE POLICY "Allow read credit balance" ON ai_credit_balance FOR SELECT USING (true);
CREATE POLICY "Allow read credit transactions" ON ai_credit_transactions FOR SELECT USING (true);

-- Solo service_role puede insertar/actualizar
CREATE POLICY "Service role can modify balance" ON ai_credit_balance FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can insert transactions" ON ai_credit_transactions FOR INSERT WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE ai_credit_balance IS 'Balance global de créditos de IA para Solcom';
COMMENT ON TABLE ai_credit_transactions IS 'Historial de transacciones de créditos (compras y consumos)';
COMMENT ON FUNCTION process_credit_transaction IS 'Procesa una transacción de créditos y actualiza el balance';
COMMENT ON FUNCTION consume_credits IS 'Consume créditos automáticamente desde el webhook de IA';
