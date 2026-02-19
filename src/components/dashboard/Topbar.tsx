import { X } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import UserProfileDropdown from './UserProfileDropdown';

export default function Topbar() {
  const { isOpen, toggle } = useSidebar();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        gap: 16,
      }}
    >
      {/* Mobile Menu Button - Logo Style */}
      <button
        onClick={toggle}
        className="mobile-menu-trigger"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'none', // CSS below handles visibility
          alignItems: 'center',
        }}
      >
        {!isOpen && (
          <div style={{
            background: '#FFFFFF',
            padding: '6px 10px',
            borderRadius: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <img
              src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
              alt="Solis Comercial"
              style={{ height: 32, width: 'auto' }}
            />
          </div>
        )}
        {isOpen && <X size={24} color="#F9FAFB" style={{ background: '#1F2937', padding: 4, borderRadius: 4 }} />}
      </button>

      <div className="topbar-content" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <UserProfileDropdown />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1024px) {
          .mobile-menu-trigger {
            display: flex !important;
          }
        }
        @media (max-width: 480px) {
          .topbar-date {
            font-size: 12px;
            /* Opcional: ocultar fecha en pantallas muy pequeñas si no cabe */
          }
        }
      `}</style>
    </header>
  );
}
