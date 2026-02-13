'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { LogIn, KeyRound, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError('Correo o contraseña incorrectos');
        setLoading(false);
        return;
      }

      window.location.replace('/inventory');
    } catch (error: any) {
      // Mensajes amigables según el tipo de error
      let userMessage = 'No pudimos iniciar sesión. Por favor, intenta de nuevo.';

      if (error.message?.includes('Invalid login credentials')) {
        userMessage = 'Correo o contraseña incorrectos. Verifica tus datos.';
      } else if (error.message?.includes('Email not confirmed')) {
        userMessage = 'Por favor, confirma tu correo electrónico antes de iniciar sesión.';
      } else if (error.message?.includes('Database error') || error.status === 500) {
        userMessage = 'El sistema está configurándose. Por favor, contacta al administrador.';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        userMessage = 'Sin conexión a internet. Verifica tu conexión.';
      }

      setError(userMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setResetSuccess(true);
    } catch (error: any) {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #071826 0%, #0a2540 100%)',
      padding: 20,
    }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <Card>
          <div style={{ padding: 40 }}>
            {/* Logo con fondo blanco para legibilidad */}
            <div style={{ 
              textAlign: 'center', 
              marginBottom: 32,
              background: '#ffffff',
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
              <img 
                src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png" 
                alt="Solis Comercial" 
                style={{ width: '100%', maxWidth: 240, height: 'auto', margin: '0 auto' }}
              />
            </div>

            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 8 }}>
                {resetMode ? '¿Olvidaste tu contraseña?' : 'Bienvenido'}
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                {resetMode 
                  ? 'Ingresa tu correo para recibir instrucciones' 
                  : 'Accede al dashboard de inventario'
                }
              </p>
            </div>

            {error && (
              <div style={{
                padding: 14,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {resetSuccess && (
              <div style={{
                padding: 14,
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>✅</span>
                <span>Correo enviado. Revisa tu bandeja de entrada.</span>
              </div>
            )}

            {resetMode ? (
              <form onSubmit={handleResetPassword} style={{ display: 'grid', gap: 20 }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: 13, 
                    fontWeight: 500, 
                    marginBottom: 8,
                    color: 'var(--text)'
                  }}>
                    Correo Electrónico
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ 
                      position: 'absolute', 
                      left: 14, 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)'
                    }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      required
                      autoComplete="off"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 44px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 14,
                        color: 'var(--text)',
                        outline: 'none',
                        transition: 'all 0.2s',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '14px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: loading ? 'var(--muted)' : 'var(--brand-primary)',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Mail size={18} />
                  {loading ? 'Enviando...' : 'Enviar Correo de Recuperación'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setResetMode(false);
                    setError('');
                    setResetSuccess(false);
                  }}
                  style={{
                    padding: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--brand-primary)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  ← Volver al inicio de sesión
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} style={{ display: 'grid', gap: 20 }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: 13, 
                    fontWeight: 500, 
                    marginBottom: 8,
                    color: 'var(--text)'
                  }}>
                    Correo Electrónico
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ 
                      position: 'absolute', 
                      left: 14, 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)'
                    }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      required
                      autoComplete="off"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 44px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 14,
                        color: 'var(--text)',
                        outline: 'none',
                        transition: 'all 0.2s',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: 13, 
                    fontWeight: 500, 
                    marginBottom: 8,
                    color: 'var(--text)'
                  }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={18} style={{ 
                      position: 'absolute', 
                      left: 14, 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)'
                    }} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 44px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontSize: 14,
                        color: 'var(--text)',
                        outline: 'none',
                        transition: 'all 0.2s',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setResetMode(true)}
                  style={{
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--brand-primary)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'right',
                    marginTop: -8,
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '14px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: loading ? 'var(--muted)' : 'var(--brand-primary)',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 0, 0, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {loading ? (
                    'Iniciando sesión...'
                  ) : (
                    <>
                      <LogIn size={18} />
                      Iniciar Sesión
                    </>
                  )}
                </button>
              </form>
            )}

            {!resetMode && (
              <div style={{ 
                marginTop: 28, 
                padding: 16,
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>
                  Credenciales de prueba:
                </p>
                <div style={{ 
                  fontSize: 12, 
                  fontFamily: 'monospace',
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: 10,
                  borderRadius: 6,
                  lineHeight: 1.6
                }}>
                  <div><strong>Admin:</strong> admin@soliscomercialni.com / admin123</div>
                  <div style={{ marginTop: 4 }}><strong>Manager:</strong> manager@soliscomercialni.com / manager123</div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div style={{ 
          textAlign: 'center', 
          marginTop: 24, 
          fontSize: 13, 
          color: 'rgba(255, 255, 255, 0.5)' 
        }}>
          © 2026 Solis Comercial - ¡A tu servicio, siempre!
        </div>
      </div>
    </div>
  );
}
