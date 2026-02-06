'use client';

import NotificationsDropdown from './NotificationsDropdown';
import UserProfileDropdown from './UserProfileDropdown';

export default function Topbar() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="topbar-date">
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {new Date().toLocaleDateString('es-NI', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NotificationsDropdown />
        <UserProfileDropdown />
      </div>

      <style jsx>{`
        header {
          transition: padding-left 0.3s;
        }
        @media (max-width: 1024px) {
          header {
            padding-left: 60px !important; /* Space for the menu button */
          }
        }
        @media (max-width: 480px) {
          .topbar-date {
            font-size: 10px;
          }
        }
      `}</style>
    </header>
  );
}
