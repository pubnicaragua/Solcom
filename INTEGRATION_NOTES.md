# Notas de Integración con Zoho Books

## Estado Actual
Los botones de importar y exportar están preparados para la integración con Zoho Books API.

## Funcionalidades Preparadas

### 1. Exportación de Inventario
- **Ubicación**: `src/app/(dashboard)/inventory/page.tsx`
- **Función**: `handleExport(format: 'csv' | 'excel' | 'pdf')`
- **Estado**: Preparado para integración
- **Endpoint actual**: `/api/inventory/export`
- **Acción requerida**: Conectar con Zoho Books API para exportar datos directamente

### 2. Importación de Inventario
- **Ubicación**: `src/app/(dashboard)/inventory/page.tsx`
- **Botón**: "Importar" con icono Upload
- **Estado**: Preparado para integración
- **Acción requerida**: 
  - Implementar endpoint `/api/inventory/import`
  - Conectar con Zoho Books API para importar datos
  - Agregar validación de formato de archivo
  - Implementar manejo de errores

### 3. Sincronización con Zoho
- **Endpoint existente**: `/api/zoho/sync`
- **Estado**: Funcional pero requiere credenciales
- **Acción requerida**:
  - Configurar credenciales de Zoho Creator en variables de entorno
  - Probar sincronización completa
  - Implementar sincronización automática programada

## Variables de Entorno Requeridas

```env
# Zoho Creator
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REDIRECT_URI=your_redirect_uri
ZOHO_REFRESH_TOKEN=your_refresh_token

# Zoho Books (pendiente)
ZOHO_BOOKS_ORGANIZATION_ID=your_org_id
ZOHO_BOOKS_API_KEY=your_api_key
```

## Próximos Pasos

1. Obtener credenciales de Zoho Books
2. Implementar endpoints de importación
3. Conectar exportación con Zoho Books API
4. Probar flujo completo de sincronización
5. Implementar manejo robusto de errores
6. Agregar logs de auditoría

## Documentación de Referencia

- [Zoho Books API](https://www.zoho.com/books/api/v3/)
- [Zoho Creator API](https://www.zoho.com/creator/help/api/)
