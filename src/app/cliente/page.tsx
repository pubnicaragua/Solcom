'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/cliente/dashboard');
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#1F2937',
      color: 'white'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
          Cargando...
        </div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Redirigiendo al dashboard
        </div>
      </div>
    </div>
  );
}
