'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Bell, X } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toast, setToast] = useState<Notification | null>(null);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadInitialNotifications();

    // Suscribirse a cambios en tiempo real en la tabla de notificaciones
    const channel = supabase.channel('realtime_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          showToastAndPlaySound(newNotif);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadInitialNotifications() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
  }

  function showToastAndPlaySound(notif: Notification) {
    setToast(notif);
    
    // Intentar reproducir sonido de notificación
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Fallback: Web Audio API beep si el .mp3 no se puede reproducir
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.15;
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch (_) {}
      });
    } catch (_) {}

    // Ocultar toast después de 5 segundos
    setTimeout(() => {
      setToast(null);
    }, 5000);
  }

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userData.user.id);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
      
      {/* Sistema de Toast (Notificación visual flotante) */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--panel, #1F2937)',
          border: '1px solid var(--border, #374151)',
          borderRadius: 8,
          padding: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          zIndex: 9999,
          maxWidth: 400,
          animation: 'notifSlideIn 0.3s ease-out'
        }}>
          <div style={{ 
            background: toast.type === 'low_stock' ? 'rgba(234,179,8,0.12)' : 
                        toast.type === 'sync_error' ? 'rgba(239,68,68,0.12)' : 'rgba(220,38,38,0.12)',
            padding: 8,
            borderRadius: '50%'
          }}>
            <Bell size={20} color={
              toast.type === 'low_stock' ? '#EAB308' : 
              toast.type === 'sync_error' ? '#EF4444' : '#DC2626'
            } />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{toast.title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted, #9CA3AF)' }}>{toast.message}</div>
          </div>
          <button 
            onClick={() => setToast(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #9CA3AF)' }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <style jsx global>{`
        @keyframes notifSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </NotificationsContext.Provider>
  );
}