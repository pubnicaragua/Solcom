'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import AuthShell from '@/components/auth/AuthShell';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogIn, Mail } from 'lucide-react';

const GENERIC_AUTH_ERROR = 'Credenciales invalidas o acceso no autorizado.';

function resolveLoginError(error: unknown): string {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'No se pudo conectar con el servicio. Intenta nuevamente.';
  }
  return GENERIC_AUTH_ERROR;
}

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(GENERIC_AUTH_ERROR);
        setLoading(false);
        return;
      }

      window.location.replace('/inventory');
    } catch (error: unknown) {
      setError(resolveLoginError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
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
    } catch {
      setError('No se pudo procesar la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  const fieldLabelStyle: CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 8,
    color: 'var(--text)',
  };

  const fieldInputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 14px 12px 42px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'rgba(15, 23, 42, 0.8)',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    transition: 'all 0.2s',
  };

  const submitButtonStyle: CSSProperties = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 10,
    border: 'none',
    background: loading ? 'rgba(148, 163, 184, 0.35)' : 'var(--brand-primary)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  };

  return (
    <AuthShell
      title={resetMode ? 'Recuperar acceso' : 'Login de usuarios'}
      subtitle={resetMode ? 'Ingresa tu correo para restablecer la contraseña.' : 'Portal de acceso'}
    >
      {error && (
        <div
          style={{
            padding: '11px 12px',
            background: 'rgba(239, 68, 68, 0.10)',
            border: '1px solid rgba(239, 68, 68, 0.30)',
            borderRadius: 10,
            marginBottom: 14,
            fontSize: 12,
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {resetSuccess && (
        <div
          style={{
            padding: '11px 12px',
            background: 'rgba(16, 185, 129, 0.10)',
            border: '1px solid rgba(16, 185, 129, 0.30)',
            borderRadius: 10,
            marginBottom: 14,
            fontSize: 12,
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={14} />
          <span>Si el correo es valido, recibiras instrucciones para continuar.</span>
        </div>
      )}

      {resetMode ? (
        <form onSubmit={handleResetPassword} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={fieldLabelStyle}>Correo electronico</label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={17}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
                required
                autoComplete="email"
                style={fieldInputStyle}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} style={submitButtonStyle}>
            <Mail size={17} />
            {loading ? 'Enviando...' : 'Enviar instrucciones'}
          </button>

          <button
            type="button"
            onClick={() => {
              setResetMode(false);
              setError('');
              setResetSuccess(false);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 13,
              fontWeight: 500,
              textAlign: 'center',
              padding: 0,
            }}
          >
            Volver al inicio de sesion
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={fieldLabelStyle}>Correo electronico</label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={17}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
                required
                autoComplete="email"
                style={fieldInputStyle}
              />
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>Contrasena</label>
            <div style={{ position: 'relative' }}>
              <KeyRound
                size={17}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{ ...fieldInputStyle, paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setResetMode(true);
              setError('');
              setResetSuccess(false);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 12,
              fontWeight: 500,
              padding: 0,
              textAlign: 'right',
            }}
          >
            ¿Olvidaste tu contrasena?
          </button>

          <button type="submit" disabled={loading} style={submitButtonStyle}>
            {loading ? (
              'Ingresando...'
            ) : (
              <>
                <LogIn size={17} />
                Ingresar
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
