'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, X, Clock, AlertCircle, Package } from 'lucide-react';
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
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);

    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  }

  return (
    <div className="notifications-dropdown" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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
              <h3>Notificaciones</h3>
              {unreadCount > 0 && (
                <span className="notifications-new-count">{unreadCount} nuevas</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="notifications-mark-all"
                type="button"
              >
                <Check size={14} aria-hidden="true" />
                <span>Marcar todas como leídas</span>
              </button>
            )}
          </div>

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="notifications-empty">
                <span className="notifications-empty-icon"><Bell size={22} aria-hidden="true" /></span>
                <strong>Estás al día</strong>
                <p>No tienes notificaciones pendientes.</p>
              </div>
            ) : (
              notifications.map((notification: Notification) => (
                <div
                  key={notification.id}
                  className={`notification-item${notification.is_read ? ' is-read' : ' is-unread'}`}
                  onClick={() => markAsRead(notification.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      markAsRead(notification.id);
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
