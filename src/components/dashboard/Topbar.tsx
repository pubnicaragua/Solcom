import { Moon, Sun, X } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useTheme } from '@/contexts/ThemeContext';
import UserProfileDropdown from './UserProfileDropdown';
import NotificationsDropdown from './NotificationsDropdown';
import { useRoleAccess } from '@/hooks/useRoleAccess';

export default function Topbar() {
  const { isOpen, toggle } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const { access: brandingAccess, loading: brandingLoading } = useRoleAccess('branding');
  const canViewBrandLogo = !brandingLoading && brandingAccess.can_view;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel)',
        boxShadow: '0 5px 20px var(--shadow)',
        minHeight: 64,
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
            {canViewBrandLogo ? (
              <img
                src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
                alt="Solis Comercial"
                style={{ height: 32, width: 'auto' }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', letterSpacing: 0.4 }}>SC</span>
            )}
          </div>
        )}
        {isOpen && <X size={24} color="var(--text)" style={{ background: 'var(--panel-elevated)', padding: 4, borderRadius: 4 }} />}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="theme-toggle-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 38,
              padding: '0 12px',
              border: '1px solid var(--border)',
              borderRadius: 9,
              background: 'var(--control-bg)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
              transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
            }}
          >
            {theme === 'dark' ? <Sun size={16} color="var(--warning)" /> : <Moon size={16} color="var(--brand-primary)" />}
            <span className="theme-toggle-label">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
          <NotificationsDropdown />
          <UserProfileDropdown />
        </div>
      </div>

      <style jsx>{`
        .theme-toggle-button:hover {
          border-color: var(--brand-primary) !important;
          transform: translateY(-1px);
        }

        .theme-toggle-button:active {
          transform: translateY(0);
        }

        .theme-toggle-button:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }

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
          .theme-toggle-label {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
