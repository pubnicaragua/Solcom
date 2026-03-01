-- Consulta para ver Usuarios, sus Roles y sus Permisos
SELECT 
    up.full_name AS "Nombre de Usuario",
    up.email AS "Correo",
    r.name AS "Rol",
    r.description AS "Descripción del Rol",
    string_agg(p.name, ', ') AS "Accesos (Permisos)"
FROM 
    public.user_profiles up
LEFT JOIN 
    public.roles r ON up.role = r.name
LEFT JOIN 
    public.role_permissions rp ON r.name = rp.role
LEFT JOIN 
    public.permissions p ON rp.permission_code = p.code
GROUP BY 
    up.full_name, up.email, r.name, r.description
ORDER BY 
    r.name, up.full_name;

-- ---------------------------------------------------------
-- Consulta alternativa: Ver solo los Roles y los Permisos que tienen asignados (sin usuarios)
-- ---------------------------------------------------------
SELECT 
    r.name AS "Rol",
    r.description AS "Descripción del Rol",
    p.module AS "Módulo",
    string_agg(p.name, ', ') AS "Permisos Asignados"
FROM 
    public.roles r
LEFT JOIN 
    public.role_permissions rp ON r.name = rp.role
LEFT JOIN 
    public.permissions p ON rp.permission_code = p.code
GROUP BY 
    r.name, r.description, p.module
ORDER BY 
    r.name, p.module;