'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AuthShell from '@/components/auth/AuthShell';
import { AlertCircle, Eye, EyeOff, KeyRound, LogIn, Mail } from 'lucide-react';

const GENERIC_AUTH_ERROR = 'Credenciales invalidas o acceso no autorizado.';

function resolveClientLoginError(error: unknown): string {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'No se pudo conectar con el servicio. Intenta nuevamente.';
  }
  return GENERIC_AUTH_ERROR;
}

export default function LoginClientesPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      if (data.user) {
        await new Promise(resolve => setTimeout(resolve, 100));
        router.push('/cliente/dashboard');
        return;
      }
    } catch (err: unknown) {
      setError(resolveClientLoginError(err));
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
    marginTop: 4,
  };

  return (
    <AuthShell title="Login de usuarios" subtitle="Portal de acceso">
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
              disabled={loading}
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
              disabled={loading}
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

        <button type="submit" disabled={loading || !email || !password} style={submitButtonStyle}>
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
    </AuthShell>
  );
}
