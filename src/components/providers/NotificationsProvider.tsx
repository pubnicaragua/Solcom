'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Bell, X } from 'lucide-react';

export type Notification = {
  id: string;
  user_id?: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationStatus = 'loading' | 'connected' | 'polling' | 'error' | 'signed_out';

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  status: NotificationStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  soundEnabled: boolean;
  soundReady: boolean;
  enableNotificationSound: () => Promise<boolean>;
  unlockNotificationSound: () => Promise<void>;
  toggleNotificationSound: () => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  status: 'loading',
  lastSyncedAt: null,
  lastError: null,
  soundEnabled: true,
  soundReady: false,
  enableNotificationSound: async () => false,
  unlockNotificationSound: async () => {},
  toggleNotificationSound: async () => false,
  refreshNotifications: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toast, setToast] = useState<Notification | null>(null);
  const [status, setStatus] = useState<NotificationStatus>('loading');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const channelStatusRef = useRef<'connecting' | 'connected' | 'polling'>('connecting');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(true);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem('solcom-notification-sound');
    const enabled = storedPreference !== 'off';
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    return audioContextRef.current;
  }, []);

  const unlockNotificationSound = useCallback(async () => {
    if (!soundEnabledRef.current) return;
    try {
      const context = getAudioContext();
      if (!context) return;
      if (context.state === 'suspended') await context.resume();
      setSoundReady(context.state === 'running');
    } catch (_) {
      setSoundReady(false);
    }
  }, [getAudioContext]);

  const playNotificationSound = useCallback(async () => {
    if (!soundEnabledRef.current) return false;

    try {
      const context = getAudioContext();
      if (context) {
        if (context.state === 'suspended') await context.resume();
        if (context.state === 'running') {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, context.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.16);
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.21);
          setSoundReady(true);
          return true;
        }
      }
    } catch (_) {
      // Fallback below covers browsers where Web Audio is unavailable.
    }

    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      await audio.play();
      setSoundReady(true);
      return true;
    } catch (_) {
      // Autoplay can be blocked until the user unlocks sound from the bell.
      return false;
    }
  }, [getAudioContext]);

  const enableNotificationSound = useCallback(async () => {
    soundEnabledRef.current = true;
    setSoundEnabled(true);
    window.localStorage.setItem('solcom-notification-sound', 'on');
    return playNotificationSound();
  }, [playNotificationSound]);

  const toggleNotificationSound = useCallback(async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      setSoundReady(false);
      window.localStorage.setItem('solcom-notification-sound', 'off');
      return false;
    }

    return enableNotificationSound();
  }, [enableNotificationSound]);

  const refreshNotifications = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      userIdRef.current = null;
      setNotifications([]);
      setStatus('signed_out');
      setLastError(null);
      return;
    }

    userIdRef.current = user.id;

    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, title, message, type, link, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setStatus('error');
      setLastError(error.message || 'No se pudieron cargar las notificaciones.');
      return;
    }

    setNotifications((data || []) as Notification[]);
    setLastSyncedAt(new Date().toISOString());
    setLastError(null);
    if (channelStatusRef.current !== 'connected') {
      channelStatusRef.current = 'polling';
      setStatus('polling');
    }
  }, [supabase]);

  const showToastAndPlaySound = useCallback((notification: Notification) => {
    setToast(notification);
    void playNotificationSound();

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, [playNotificationSound]);

  useEffect(() => {
    let disposed = false;
    const authState = supabase.auth.onAuthStateChange((_event, session) => {
      if (!disposed) setAuthUserId(session?.user?.id || null);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      setAuthUserId(data.session?.user?.id || null);
      setAuthResolved(true);
    });

    return () => {
      disposed = true;
      authState.data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    if (!authResolved) return undefined;
    if (!authUserId) {
      userIdRef.current = null;
      setNotifications([]);
      setStatus('signed_out');
      setLastError(null);
      return undefined;
    }

    const initialize = async () => {
      userIdRef.current = authUserId;
      await refreshNotifications();
      if (disposed || !userIdRef.current) return;

      const userId = userIdRef.current;
      channelStatusRef.current = 'connecting';
      channel = supabase
        .channel(`realtime_notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const newNotification = payload.new as Notification;
            setNotifications((current) => {
              if (current.some((notification) => notification.id === newNotification.id)) return current;
              return [newNotification, ...current].slice(0, 50);
            });
            setLastSyncedAt(new Date().toISOString());
            showToastAndPlaySound(newNotification);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const updatedNotification = payload.new as Notification;
            setNotifications((current) => current.map((notification) => (
              notification.id === updatedNotification.id ? updatedNotification : notification
            )));
            setLastSyncedAt(new Date().toISOString());
          }
        )
        .subscribe((subscriptionStatus) => {
          if (disposed) return;
          if (subscriptionStatus === 'SUBSCRIBED') {
            channelStatusRef.current = 'connected';
            setStatus('connected');
            setLastError(null);
          } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
            channelStatusRef.current = 'polling';
            setStatus('polling');
            setLastError('La actualización en tiempo real no está disponible; se revisará periódicamente.');
          }
        });

      // El polling evita que el panel quede desactualizado si Realtime se reinicia
      // o si el proyecto aún no tiene la tabla publicada en supabase_realtime.
      pollTimer = setInterval(() => {
        void refreshNotifications();
      }, 60000);
    };

    void initialize();

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (channel) void supabase.removeChannel(channel);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [authResolved, authUserId, refreshNotifications, showToastAndPlaySound, supabase]);

  const markAsRead = useCallback(async (id: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    const previous = notifications;
    setNotifications((current) => current.map((notification) => (
      notification.id === id ? { ...notification, is_read: true } : notification
    )));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      setNotifications(previous);
      setStatus('error');
      setLastError('No se pudo marcar la notificación como leída.');
    } else {
      setLastSyncedAt(new Date().toISOString());
    }
  }, [notifications, supabase]);

  const markAllAsRead = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    const previous = notifications;
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      setNotifications(previous);
      setStatus('error');
      setLastError('No se pudieron marcar todas las notificaciones como leídas.');
    } else {
      setLastSyncedAt(new Date().toISOString());
    }
  }, [notifications, supabase]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <NotificationsContext.Provider value={{
      notifications,
      unreadCount,
      status,
      lastSyncedAt,
      lastError,
      soundEnabled,
      soundReady,
      enableNotificationSound,
      unlockNotificationSound,
      toggleNotificationSound,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
    }}>
      {children}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--panel, #1F2937)',
            border: '1px solid var(--border, #374151)',
            borderRadius: 10,
            padding: '16px',
            boxShadow: '0 4px 12px var(--shadow)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            zIndex: 9999,
            maxWidth: 400,
            animation: 'notifSlideIn 0.3s ease-out',
          }}
        >
          <div style={{
            background: toast.type === 'low_stock' ? 'rgba(234,179,8,0.12)' :
              toast.type === 'sync_error' ? 'rgba(239,68,68,0.12)' : 'rgba(220,38,38,0.12)',
            padding: 8,
            borderRadius: '50%',
          }}>
            <Bell size={20} color={
              toast.type === 'low_stock' ? '#EAB308' :
                toast.type === 'sync_error' ? '#EF4444' : '#DC2626'
            } />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{toast.title}</div>
            <div style={{ fontSize: 14, color: 'var(--muted, #9CA3AF)' }}>{toast.message}</div>
          </div>
          <button
            type="button"
            aria-label="Cerrar notificación"
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
