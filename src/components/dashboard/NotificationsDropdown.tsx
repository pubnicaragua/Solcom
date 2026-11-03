'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, X, Clock, AlertCircle, Package, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { useNotifications, type Notification } from '@/components/providers/NotificationsProvider';

export default function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useNotifications();

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
        return <AlertCircle size={16} color="var(--warning)" />;
      case 'sync_error':
        return <X size={16} color="var(--danger)" />;
      case 'new_transfer':
        return <Package size={16} color="var(--info)" />;
      default:
        return <Bell size={16} color="var(--info)" />;
    }
  }

  function getTimeAgo(dateString: string) {
    const timestamp = new Date(dateString).getTime();
    if (!Number.isFinite(timestamp)) return 'Fecha no disponible';
    const seconds = Math.max(0, Math.floor((new Date().getTime() - timestamp) / 1000));

    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  }

  function getStatusLabel() {
    if (status === 'connected') return 'En tiempo real';
    if (status === 'polling') return 'Actualización periódica';
    if (status === 'error') return 'Revisar conexión';
    if (status === 'signed_out') return 'Sesión no disponible';
    return 'Conectando…';
  }

  async function handleNotificationClick(notification: Notification) {
    await markAsRead(notification.id);
    if (notification.link) window.location.assign(notification.link);
  }

  function handleTriggerClick() {
    if (soundEnabled) void unlockNotificationSound();
    setIsOpen((current) => !current);
  }

  return (
    <div className="notifications-dropdown" ref={dropdownRef}>
      <button
        onClick={handleTriggerClick}
        className={`notifications-trigger${isOpen ? ' is-open' : ''}`}
        type="button"
        aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notifications-trigger-count">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="notifications-panel"
          role="dialog"
          aria-label="Notificaciones"
        >
          <div className="notifications-panel-header">
            <div className="notifications-panel-heading">
              <span className="notifications-panel-icon"><Bell size={16} aria-hidden="true" /></span>
              <div className="notifications-panel-heading-copy">
                <div className="notifications-panel-title-row">
                  <h3>Notificaciones</h3>
                  {unreadCount > 0 && (
                    <span className="notifications-new-count">{unreadCount} nuevas</span>
                  )}
                </div>
                <div className={`notifications-panel-status is-${status}`}>
                  <span aria-hidden="true" />
                  {getStatusLabel()}
                  {lastSyncedAt && status !== 'signed_out' && (
                    <time dateTime={lastSyncedAt}> · {getTimeAgo(lastSyncedAt)}</time>
                  )}
                </div>
              </div>
            </div>
            <div className="notifications-panel-header-actions">
              <button
                onClick={() => void (soundEnabled ? toggleNotificationSound() : enableNotificationSound())}
                className={`notifications-sound${soundReady ? ' is-ready' : ''}`}
                type="button"
                aria-label={soundEnabled ? 'Desactivar sonido de notificaciones' : 'Activar sonido de notificaciones'}
                aria-pressed={soundEnabled}
                title={soundEnabled ? (soundReady ? 'Sonido activo' : 'Activar y probar sonido') : 'Activar sonido'}
              >
                {soundEnabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
                <span>Sonido</span>
              </button>
              <button
                onClick={() => void refreshNotifications()}
                className="notifications-refresh"
                type="button"
                aria-label="Actualizar notificaciones"
                title="Actualizar notificaciones"
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllAsRead()}
                  className="notifications-mark-all"
                  type="button"
                >
                  <Check size={14} aria-hidden="true" />
                  <span>Marcar todas como leídas</span>
                </button>
              )}
            </div>
          </div>

          {status === 'error' && (
            <div className="notifications-status-message" role="alert">
              <span>{lastError || 'No pudimos sincronizar las notificaciones.'}</span>
              <button type="button" onClick={() => void refreshNotifications()}>Reintentar</button>
            </div>
          )}

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="notifications-empty">
                <span className="notifications-empty-icon"><Bell size={22} aria-hidden="true" /></span>
                <strong>{status === 'error' ? 'No pudimos sincronizar' : 'Estás al día'}</strong>
                <p>{status === 'error' ? 'Usa Actualizar para volver a consultar el historial.' : 'No tienes notificaciones pendientes.'}</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item${notification.is_read ? ' is-read' : ' is-unread'}`}
                  onClick={() => void handleNotificationClick(notification)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${notification.title}. ${notification.is_read ? 'Leída' : 'Sin leer'}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handleNotificationClick(notification);
                    }
                  }}
                >
                  <span className="notification-icon" data-type={notification.type} aria-hidden="true">
                    {getIcon(notification.type)}
                  </span>
                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h4>{notification.title}</h4>
                      {!notification.is_read && <span className="notification-unread-dot" aria-label="Sin leer" />}
                    </div>
                    <p className="notification-message">{notification.message}</p>
                    <div className="notification-time">
                      <Clock size={12} aria-hidden="true" />
                      <span>{getTimeAgo(notification.created_at)}</span>
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
