-- =====================================================
-- CONFIRMAR USUARIOS MANUALMENTE
-- =====================================================

-- Verificar estado actual de confirmación
SELECT 
  email,
  email_confirmed_at,
  confirmed_at,
  CASE 
    WHEN email_confirmed_at IS NULL THEN '❌ NO CONFIRMADO'
    ELSE '✅ CONFIRMADO'
  END as status
FROM auth.users
WHERE email LIKE '%@soliscomercialni.com'
ORDER BY email;

-- Si alguno está NO CONFIRMADO, ejecutar esto:
UPDATE auth.users
SET 
  email_confirmed_at = NOW(),
  confirmed_at = NOW()
WHERE email LIKE '%@soliscomercialni.com'
  AND email_confirmed_at IS NULL;

-- Verificar que se aplicó el cambio
SELECT 
  email,
  email_confirmed_at,
  confirmed_at
FROM auth.users
WHERE email LIKE '%@soliscomercialni.com'
ORDER BY email;

-- =====================================================
-- RESULTADO ESPERADO
-- =====================================================
/*
Todos los usuarios deben tener:
- email_confirmed_at: [fecha]
- confirmed_at: [fecha]

Si todos están confirmados y aún da error 500,
el problema es la configuración de Auth en Supabase Dashboard.
*/
