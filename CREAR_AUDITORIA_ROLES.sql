-- Script corregido para crear la tabla de historial de auditoría de roles
-- Ejecutar en el editor SQL de Supabase conectado al proyecto de Solis Comercial

DROP TABLE IF EXISTS public.role_audit_logs;

CREATE TABLE public.role_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_identifier TEXT NOT NULL, 
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL, 
    details TEXT,
    previous_state JSONB,
    new_state JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_role_audit_logs_role_identifier ON public.role_audit_logs(role_identifier);
CREATE INDEX IF NOT EXISTS idx_role_audit_logs_actor_id ON public.role_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_logs_created_at ON public.role_audit_logs(created_at DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.role_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad: Usuarios autenticados pueden ver e insertar
DROP POLICY IF EXISTS "Autenticados pueden leer auditoria_roles" OñN public.role_audit_logs;
CREATE POLICY "Autenticados pueden leer auditoria_roles"
ON public.role_audit_logs FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados pueden insertar auditoria_roles" ON public.role_audit_logs;
CREATE POLICY "Autenticados pueden insertar auditoria_roles"
ON public.role_audit_logs FOR INSERT
TO authenticated WITH CHECK (auth.uid() = actor_id);
