'use client';

import { Calendar, Clock, Users, FileText, CheckCircle2, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

export default function ReunionesPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48, color: 'white' }}>
          <h1 style={{ fontSize: 48, fontWeight: 700, marginBottom: 16 }}>
            📅 Reuniones del Proyecto
          </h1>
          <p style={{ fontSize: 20, opacity: 0.9 }}>
            Minutas y seguimiento de reuniones - Solis Comercial ERP
          </p>
        </div>

        {/* Reunión Principal */}
        <Card style={{ marginBottom: 32, background: 'white', borderRadius: 16, overflow: 'hidden' }}>
          {/* Header de la Reunión */}
          <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 32, color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Calendar size={32} />
              <div>
                <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>
                  Validación y Aprobación del MVP
                </h2>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 16, opacity: 0.95 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={16} />
                    28 de Enero, 2026
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} />
                    10:30 - 11:40 AM (1h 10min)
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 12px' }}>
                ✅ Completada
              </Badge>
              <Badge style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 12px' }}>
                🎯 MVP Aprobado
              </Badge>
            </div>
          </div>

          <div style={{ padding: 32 }}>
            {/* Participantes */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={24} color="#667eea" />
                Participantes
              </h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Badge variant="neutral">👤 Luis (Solis Comercial)</Badge>
                <Badge variant="neutral">👤 Bayardo (Solis Comercial)</Badge>
                <Badge variant="neutral">👤 Equipo de Desarrollo</Badge>
              </div>
            </div>

            {/* Resumen Ejecutivo */}
            <div style={{ marginBottom: 32, padding: 24, background: '#f8f9ff', borderRadius: 12, borderLeft: '4px solid #667eea' }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#667eea' }}>
                📋 Resumen Ejecutivo
              </h3>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#4a5568', marginBottom: 12 }}>
                Se presentó y validó el <strong>MVP (Producto Mínimo Viable)</strong> del sistema ERP para Solis Comercial. 
                El cliente aprobó la interfaz visual y funcionalidades presentadas, confirmando que cumple con las expectativas iniciales.
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#4a5568' }}>
                Se definieron los <strong>siguientes pasos técnicos</strong> para integración con Zoho Creator, configuración de 
                agentes de IA con SalesIQ, y mejoras en la gestión de inventario en tiempo real.
              </p>
            </div>

            {/* Puntos Clave Discutidos */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={24} color="#667eea" />
                Puntos Clave Discutidos
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  {
                    title: '1. Integración con Zoho Creator',
                    content: 'Se validó la necesidad de conectar el sistema con Zoho Creator para obtener datos de inventario en tiempo real. Se requieren credenciales (Client ID, Client Secret, Refresh Token) y estructura de datos actual.',
                    status: 'pending'
                  },
                  {
                    title: '2. Agentes de IA con SalesIQ',
                    content: 'Actualmente usan SalesIQ (Zoho) con OpenAI para atención al cliente. El agente actual usa datos estáticos (Excel). Se propuso integración con endpoint en tiempo real para inventario actualizado.',
                    status: 'in-progress'
                  },
                  {
                    title: '3. Gestión de Inventario Dinámico',
                    content: 'Se confirmó la prioridad de mostrar inventario en tiempo real con disponibilidad por bodega, costos (solo para usuarios autorizados), y alertas de stock bajo.',
                    status: 'approved'
                  },
                  {
                    title: '4. Reportes y Analytics',
                    content: 'Se compartieron ejemplos de reportes actuales de Analytics. Se priorizó enfoque en inventario antes de reportes avanzados de ventas por categoría.',
                    status: 'approved'
                  },
                  {
                    title: '5. Modelo de OpenAI',
                    content: 'Se identificó que el modelo actual (GPT-4.0) es insuficiente para funciones avanzadas. Se requiere actualizar a GPT-4.5 o superior para interpretación de imágenes, audio y acciones automatizadas.',
                    status: 'action-required'
                  }
                ].map((punto, idx) => (
                  <div key={idx} style={{ padding: 20, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {punto.status === 'approved' && <CheckCircle2 size={20} color="#10b981" />}
                      {punto.status === 'action-required' && <AlertCircle size={20} color="#f59e0b" />}
                      {punto.status === 'pending' && <Clock size={20} color="#6b7280" />}
                      {punto.status === 'in-progress' && <ArrowRight size={20} color="#667eea" />}
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#1a202c' }}>
                          {punto.title}
                        </h4>
                        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a5568', margin: 0 }}>
                          {punto.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Decisiones Tomadas */}
            <div style={{ marginBottom: 32, padding: 24, background: '#f0fdf4', borderRadius: 12, borderLeft: '4px solid #10b981' }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={24} />
                Decisiones Tomadas
              </h3>
              <ul style={{ fontSize: 16, lineHeight: 1.8, color: '#4a5568', paddingLeft: 20 }}>
                <li><strong>MVP Aprobado:</strong> La interfaz visual y funcionalidades presentadas cumplen con las expectativas</li>
                <li><strong>Prioridad en Inventario:</strong> Enfocarse primero en módulo de inventario antes que reportes avanzados</li>
                <li><strong>Mantener SalesIQ:</strong> No migrar a Twilio, optimizar integración actual con SalesIQ</li>
                <li><strong>Datos en Tiempo Real:</strong> Implementar endpoints para inventario dinámico en agente de IA</li>
                <li><strong>Actualizar OpenAI:</strong> Validar acceso a modelos GPT-4.5+ para funcionalidades avanzadas</li>
              </ul>
            </div>

            {/* Acciones Pendientes */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={24} color="#f59e0b" />
                Acciones Pendientes
              </h3>
              
              {/* Para Luis - OpenAI */}
              <Card style={{ marginBottom: 16, padding: 20, background: '#fffbeb', border: '1px solid #fbbf24' }}>
                <h4 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🤖 Para Luis: Habilitar Modelo GPT-4.5+ en OpenAI
                </h4>
                <p style={{ fontSize: 14, color: '#78350f', marginBottom: 16 }}>
                  El modelo actual (GPT-4.0) no soporta interpretación de imágenes, audio ni acciones automatizadas. 
                  Se requiere actualizar a GPT-4.5 o superior.
                </p>
                <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 12 }}>
                  <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a202c' }}>
                    📝 Pasos para Habilitar Modelo 4.5+:
                  </h5>
                  <ol style={{ fontSize: 14, lineHeight: 1.8, color: '#4a5568', paddingLeft: 20, margin: 0 }}>
                    <li>Ir a <a href="https://platform.openai.com/" target="_blank" rel="noopener" style={{ color: '#667eea', textDecoration: 'underline' }}>platform.openai.com</a></li>
                    <li>Iniciar sesión con las credenciales de Solis Comercial</li>
                    <li>Navegar a <strong>Settings → Limits</strong></li>
                    <li>En la sección <strong>Model Access</strong>, verificar modelos disponibles</li>
                    <li>Si GPT-4.5 o GPT-4-turbo no aparecen, hacer clic en <strong>"Request Access"</strong></li>
                    <li>Completar el formulario indicando:
                      <ul style={{ marginTop: 8 }}>
                        <li>Uso: Agente de atención al cliente con interpretación multimedia</li>
                        <li>Volumen estimado: ~250k tokens/mes (según datos actuales)</li>
                      </ul>
                    </li>
                    <li>Esperar aprobación (usualmente 24-48 horas)</li>
                    <li>Una vez aprobado, actualizar el modelo en la configuración del agente en SalesIQ</li>
                  </ol>
                </div>
                <div style={{ padding: 12, background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#78350f' }}>
                  <strong>💡 Nota:</strong> El costo de GPT-4.5 es aproximadamente 2x el de GPT-4.0. Con el consumo actual 
                  (~$3.65/mes), se estima un costo de ~$7-8/mes. Validar presupuesto antes de activar.
                </div>
              </Card>

              {/* Para Equipo - SalesIQ API */}
              <Card style={{ padding: 20, background: '#eff6ff', border: '1px solid #3b82f6' }}>
                <h4 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔌 Para Equipo: Solicitar API REST de SalesIQ
                </h4>
                <p style={{ fontSize: 14, color: '#1e3a8a', marginBottom: 16 }}>
                  Se requiere acceso a la API REST de SalesIQ para conectar el agente de IA con datos de inventario en tiempo real.
                </p>
                <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 12 }}>
                  <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#1a202c' }}>
                    📧 Mensaje para Enviar a Soporte de SalesIQ:
                  </h5>
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 6, fontSize: 13, fontFamily: 'monospace', lineHeight: 1.6, color: '#334155', border: '1px solid #cbd5e1' }}>
                    <p style={{ margin: 0, marginBottom: 12 }}><strong>Asunto:</strong> Solicitud de Acceso a API REST - Integración con Sistema de Inventario</p>
                    <p style={{ margin: 0, marginBottom: 8 }}>Estimado equipo de SalesIQ,</p>
                    <p style={{ margin: 0, marginBottom: 8 }}>
                      Somos Solis Comercial y actualmente utilizamos SalesIQ para atención al cliente con integración de OpenAI. 
                      Necesitamos habilitar el acceso a la <strong>API REST de SalesIQ</strong> para conectar nuestro agente de IA 
                      con nuestro sistema de inventario en tiempo real.
                    </p>
                    <p style={{ margin: 0, marginBottom: 8 }}><strong>Requerimientos específicos:</strong></p>
                    <ul style={{ margin: 0, marginBottom: 8, paddingLeft: 20 }}>
                      <li>Acceso a endpoints de conversaciones (GET/POST)</li>
                      <li>Webhook para recibir mensajes entrantes</li>
                      <li>Capacidad de enviar respuestas automáticas con datos dinámicos</li>
                      <li>Acceso a ID de conversación para mantener historial por usuario</li>
                    </ul>
                    <p style={{ margin: 0, marginBottom: 8 }}>
                      <strong>Endpoint que proveeremos:</strong> Tendremos un endpoint REST que retorna inventario actualizado 
                      en formato JSON para que el agente pueda consultar disponibilidad, precios y características de productos.
                    </p>
                    <p style={{ margin: 0, marginBottom: 8 }}>
                      Por favor, indíquenos el proceso para habilitar estos accesos y la documentación técnica correspondiente.
                    </p>
                    <p style={{ margin: 0 }}>Saludos cordiales,<br/>Equipo Técnico - Solis Comercial</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a 
                    href="https://www.zoho.com/salesiq/help/developer-section/rest-api.html" 
                    target="_blank" 
                    rel="noopener"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      padding: '8px 16px', 
                      background: '#3b82f6', 
                      color: 'white', 
                      borderRadius: 6, 
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 500
                    }}
                  >
                    <ExternalLink size={16} />
                    Documentación SalesIQ API
                  </a>
                  <a 
                    href="https://api-console.zoho.com/" 
                    target="_blank" 
                    rel="noopener"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      padding: '8px 16px', 
                      background: 'white', 
                      color: '#3b82f6', 
                      border: '1px solid #3b82f6',
                      borderRadius: 6, 
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 500
                    }}
                  >
                    <ExternalLink size={16} />
                    Zoho API Console
                  </a>
                </div>
              </Card>
            </div>

            {/* Próximos Pasos */}
            <div style={{ padding: 24, background: '#f8f9ff', borderRadius: 12, borderLeft: '4px solid #667eea' }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#667eea' }}>
                🚀 Próximos Pasos
              </h3>
              <ol style={{ fontSize: 16, lineHeight: 1.8, color: '#4a5568', paddingLeft: 20, margin: 0 }}>
                <li>Solis Comercial compartirá credenciales de Zoho Creator (Client ID, Secret, Refresh Token)</li>
                <li>Equipo de desarrollo validará estructura de datos en Zoho Books</li>
                <li>Se configurará Supabase para rebote de datos (sin costo hasta 10GB)</li>
                <li>Luis habilitará modelo GPT-4.5+ en OpenAI</li>
                <li>Se solicitará acceso a API REST de SalesIQ</li>
                <li>Reunión de seguimiento próxima semana para capacitación en Supabase</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div style={{ textAlign: 'center', color: 'white', opacity: 0.9, fontSize: 14 }}>
          <p>Solis Comercial ERP - Sistema de Gestión Empresarial</p>
          <p>Desarrollado con ❤️ por el equipo de desarrollo</p>
        </div>
      </div>
    </div>
  );
}
