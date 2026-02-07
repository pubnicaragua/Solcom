'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function LoginClientesPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('Intentando login con:', email);
      
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Respuesta auth:', { data, authError });

      if (authError) {
        console.error('Error de autenticación:', authError);
        throw authError;
      }

      if (data.user) {
        console.log('✅ Login exitoso, usuario:', data.user.id);
        console.log('📝 Sesión creada en Supabase');
        
        // Esperar para asegurar que las cookies se guarden
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('🚀 Redirigiendo a dashboard...');
        
        // Usar router.push que maneja mejor las cookies de Next.js
        router.push('/cliente/dashboard');
        
        // Mantener loading activo durante la redirección
        return;
      }
    } catch (err: any) {
      console.error('Error en handleLogin:', err);
      setError(err.message || 'Error al iniciar sesión');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111827',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#1F2937',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        padding: '40px',
        border: '1px solid #374151'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
            src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
            alt="Solis Comercial"
            style={{ 
              maxWidth: '200px', 
              height: 'auto', 
              marginBottom: 24,
              background: 'white',
              padding: 12,
              borderRadius: 8
            }}
          />
          <div style={{
            fontSize: 14,
            color: '#9CA3AF',
            marginBottom: 16
          }}>
            Portal de Clientes
          </div>
          <div style={{
            width: '60px',
            height: '4px',
            background: '#DC2626',
            borderRadius: '2px',
            margin: '0 auto'
          }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#D1D5DB',
              marginBottom: 8
            }}>
              Correo Electrónico
            </label>
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: 14,
                background: '#111827',
                color: '#F9FAFB',
                transition: 'all 0.2s'
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#D1D5DB',
              marginBottom: 8
            }}>
              Contraseña
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: 14,
                background: '#111827',
                color: '#F9FAFB',
                transition: 'all 0.2s'
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 14px',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              fontSize: 13,
              color: '#dc2626'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: loading ? '#4B5563' : '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              marginTop: 8
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Ingresar'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: '1px solid #374151',
          fontSize: 13,
          color: '#9CA3AF',
          textAlign: 'center'
        }}>
          ¿Necesitas ayuda? Contacta a{' '}
          <a href="mailto:soporte@soliscomercial.com" style={{
            color: '#DC2626',
            textDecoration: 'none',
            fontWeight: 600
          }}>
            soporte@soliscomercial.com
          </a>
        </div>
      </div>
    </div>
  );
}
