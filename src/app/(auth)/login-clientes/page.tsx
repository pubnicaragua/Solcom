'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AuthShell from '@/components/auth/AuthShell';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LogIn, Mail } from 'lucide-react';
import { isClientPortalUser } from '@/lib/auth/client-portal';

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

      if (data.user && !isClientPortalUser(data.user.id)) {
        await supabase.auth.signOut();
        setError('Este acceso está reservado para usuarios del portal de cliente.');
        setLoading(false);
        return;
      }

      if (data.user) {
        router.replace('/cliente/dashboard');
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
    background: 'var(--panel-elevated)',
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
    <AuthShell title="Portal de clientes" subtitle="Consulta de inventario disponible" footerText="Acceso separado del ERP interno">
      {error && (
        <div
          style={{
            padding: '11px 12px',
            background: 'var(--danger-surface)',
            border: '1px solid rgba(239, 68, 68, 0.30)',
            borderRadius: 10,
            marginBottom: 14,
            fontSize: 12,
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            marginBottom: 14,
            border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)',
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--brand-primary) 9%, transparent)',
            color: 'var(--text)',
            fontSize: 12,
          }}
        >
          <Loader2 size={16} style={{ color: 'var(--brand-primary)', animation: 'login-spin 0.8s linear infinite' }} />
          <span>Verificando acceso al portal de cliente…</span>
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
            <><Loader2 size={17} style={{ animation: 'login-spin 0.8s linear infinite' }} /> Cargando inventario…</>
          ) : (
            <>
              <LogIn size={17} />
              Ingresar
            </>
          )}
        </button>
      </form>
      <style jsx global>{`
        @keyframes login-spin { to { transform: rotate(360deg); } }
      `}</style>
    </AuthShell>
  );
}
