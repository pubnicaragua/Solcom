-- ============================================================
-- Recalcular costos históricos con nueva tarifa
-- OpenAI GPT-4o: $1.41/M tokens
-- Cliente paga 15% menos: $1.20/M tokens
-- ============================================================

-- Actualizar todos los registros de salesiq_chatbot con la nueva tarifa
UPDATE ai_usage_logs
SET cost = (tokens / 1000000.0) * 1.20
WHERE request_type = 'salesiq_chatbot';

-- Verificar el resultado
SELECT 
  COUNT(*) as total_registros,
  SUM(tokens) as total_tokens,
  SUM(cost) as costo_total,
  AVG(cost) as costo_promedio
FROM ai_usage_logs
WHERE request_type = 'salesiq_chatbot';
