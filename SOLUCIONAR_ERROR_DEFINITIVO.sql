-- =====================================================
-- SOLUCIÓN DEFINITIVA AL ERROR 500
-- =====================================================

-- PROBLEMA IDENTIFICADO:
-- La columna email_change tiene NULL pero Auth espera string vacío ''

-- SOLUCIÓN: Actualizar todas las columnas que pueden causar el error
UPDATE auth.users
SET 
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email LIKE '%@soliscomercialni.com';

-- Verificar que se aplicó el cambio
SELECT 
  email,
  CASE 
    WHEN email_change IS NULL THEN '❌ NULL'
    ELSE '✅ STRING'
  END as email_change_status,
  CASE 
    WHEN phone_change IS NULL THEN '❌ NULL'
    ELSE '✅ STRING'
  END as phone_change_status
FROM auth.users
WHERE email LIKE '%@soliscomercialni.com';

-- =====================================================
-- DESPUÉS DE EJECUTAR ESTO, EL LOGIN DEBERÍA FUNCIONAR
-- =====================================================
