-- =====================================================
-- CREAR USUARIOS DE PRUEBA CON CONTRASEÑAS
-- =====================================================
-- Ejecutar este SQL en Supabase SQL Editor

-- IMPORTANTE: Supabase maneja los IDs automáticamente
-- Este script crea usuarios directamente en auth.users

-- 1. Usuario Admin
DO $$
DECLARE
  user_id UUID;
  identity_id UUID;
BEGIN
  -- Generar IDs
  user_id := gen_random_uuid();
  identity_id := gen_random_uuid();

  -- Crear usuario en auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    'admin@soliscomercialni.com',
    crypt('admin123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Administrador","role":"admin"}',
    NOW(),
    NOW(),
    '',
    ''
  );

  -- Crear identidad con provider_id
  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    user_id::text,
    user_id,
    format('{"sub":"%s","email":"admin@soliscomercialni.com"}', user_id)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Usuario Admin creado con ID: %', user_id;
END $$;

-- 2. Usuario Manager
DO $$
DECLARE
  user_id UUID;
BEGIN
  user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    'manager@soliscomercialni.com',
    crypt('manager123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Gerente","role":"manager"}',
    NOW(),
    NOW(),
    '',
    ''
  );

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    user_id::text,
    user_id,
    format('{"sub":"%s","email":"manager@soliscomercialni.com"}', user_id)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Usuario Manager creado con ID: %', user_id;
END $$;

-- 3. Usuario Operator
DO $$
DECLARE
  user_id UUID;
BEGIN
  user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    'operator@soliscomercialni.com',
    crypt('operator123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Operador","role":"operator"}',
    NOW(),
    NOW(),
    '',
    ''
  );

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    user_id::text,
    user_id,
    format('{"sub":"%s","email":"operator@soliscomercialni.com"}', user_id)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Usuario Operator creado con ID: %', user_id;
END $$;

-- 4. Usuario Auditor
DO $$
DECLARE
  user_id UUID;
BEGIN
  user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    'auditor@soliscomercialni.com',
    crypt('auditor123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Auditor","role":"auditor"}',
    NOW(),
    NOW(),
    '',
    ''
  );

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    user_id::text,
    user_id,
    format('{"sub":"%s","email":"auditor@soliscomercialni.com"}', user_id)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Usuario Auditor creado con ID: %', user_id;
END $$;

-- =====================================================
-- VERIFICAR QUE LOS USUARIOS SE CREARON CORRECTAMENTE
-- =====================================================

-- Ver usuarios creados
SELECT 
  u.id,
  u.email,
  up.full_name,
  up.role,
  u.email_confirmed_at,
  u.created_at
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com'
ORDER BY u.created_at DESC;

-- =====================================================
-- CREDENCIALES DE ACCESO
-- =====================================================

/*
USUARIOS CREADOS:

1. ADMIN
   Email: admin@soliscomercialni.com
   Password: admin123
   Rol: admin

2. MANAGER
   Email: manager@soliscomercialni.com
   Password: manager123
   Rol: manager

3. OPERATOR
   Email: operator@soliscomercialni.com
   Password: operator123
   Rol: operator

4. AUDITOR
   Email: auditor@soliscomercialni.com
   Password: auditor123
   Rol: auditor

NOTA: Los perfiles en user_profiles se crean automáticamente
mediante el trigger on_auth_user_created
*/
