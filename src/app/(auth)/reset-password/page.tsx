'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Card from '@/components/ui/Card';
import { KeyRound, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Verificar que hay un token de recuperación
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Usuario está en proceso de recuperación
      }
    });
  }, [supabase]);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'Error al restablecer contraseña');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #071826 0%, #0a2540 100%)',
        padding: 20,
      }}>
        <Card>
          <div style={{ padding: 60, textAlign: 'center' }}>
            <CheckCircle size={64} color="var(--success)" style={{ margin: '0 auto 24px' }} />
            <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
              ¡Contraseña Actualizada!
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              Redirigiendo al inicio de sesión...
            </p>
          </div>
        </Card>
      </div>
    );
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
                Nueva Contraseña
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                Ingresa tu nueva contraseña
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

            <form onSubmit={handleResetPassword} style={{ display: 'grid', gap: 20 }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Nueva Contraseña
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
                    minLength={6}
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

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 500, 
                  marginBottom: 8,
                  color: 'var(--text)'
                }}>
                  Confirmar Contraseña
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
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
                <KeyRound size={18} />
                {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </form>
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
