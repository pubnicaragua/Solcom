'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export default function SyncStatus() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSync() {
    setSyncing(true);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch('/api/zoho/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(`Sincronizado: ${data.itemsProcessed || 0} items`);
      } else {
        setStatus('error');
        setMessage(data.error || 'Error en sincronización');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Error de conexión');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {syncing && (
            <RefreshCw
              size={20}
              color="var(--brand-primary)"
              style={{ animation: 'spin 1s linear infinite' }}
            />
          )}
          {status === 'success' && <CheckCircle size={20} color="var(--success)" />}
          {status === 'error' && <AlertCircle size={20} color="var(--danger)" />}

          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {syncing ? 'Sincronizando...' : 'Estado de Sincronización'}
            </div>
            {message && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{message}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {status === 'success' && <Badge variant="success">Exitoso</Badge>}
          {status === 'error' && <Badge variant="danger">Error</Badge>}

          <Button onClick={handleSync} disabled={syncing} size="sm">
            <RefreshCw size={16} />
            Sincronizar Ahora
          </Button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Card>
  );
}
