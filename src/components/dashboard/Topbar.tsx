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
      <div>
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
    </header>
  );
}
