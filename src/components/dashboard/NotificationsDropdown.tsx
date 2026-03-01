'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, X, Clock, AlertCircle, Package } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { useNotifications } from '@/components/providers/NotificationsProvider';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

export default function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  function getIcon(type: string) {
    switch (type) {
      case 'low_stock':
        return <AlertCircle size={16} color="#eab308" />;
      case 'sync_error':
        return <X size={16} color="#ef4444" />;
      case 'new_transfer':
        return <Package size={16} color="#3b82f6" />;
      default:
        return <Bell size={16} color="#3b82f6" />;
    }
  }

  function getTimeAgo(dateString: string) {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    
    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          padding: '8px',
          background: 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--panel)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Bell size={18} color="var(--text)" />
        {unreadCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxHeight: '500px',
            background: '#0f1419',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Notificaciones
              </h3>
              {unreadCount > 0 && (
                <Badge variant="danger" size="sm">
                  {unreadCount} nuevas
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  color: 'var(--brand-primary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                }}
              >
                <Bell size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ fontSize: '14px' }}>No tienes notificaciones</p>
              </div>
            ) : (
              notifications.map((notification: Notification) => (
                <div
                  key={notification.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: notification.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--panel)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = notification.is_read
                      ? 'transparent'
                      : 'rgba(59, 130, 246, 0.05)';
                  }}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ marginTop: '2px' }}>{getIcon(notification.type)}</div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'start',
                          marginBottom: '4px',
                        }}
                      >
                        <h4
                          style={{
                            fontSize: '14px',
                            fontWeight: notification.is_read ? 500 : 600,
                            margin: 0,
                          }}
                        >
                          {notification.title}
                        </h4>
                      </div>
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--muted)',
                          margin: '0 0 8px 0',
                          lineHeight: 1.4,
                        }}
                      >
                        {notification.message}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: 'var(--muted)',
                        }}
                      >
                        <Clock size={11} />
                        {getTimeAgo(notification.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
