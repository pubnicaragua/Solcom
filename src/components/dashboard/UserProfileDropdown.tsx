'use client';

import { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut, Shield, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

export default function UserProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, role')
          .eq('id', authUser.id)
          .single();

        setUser({
          name: profile?.full_name || 'Usuario',
          email: authUser.email || '',
          role: profile?.role || 'user',
        });
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin':
        return '#ef4444';
      case 'manager':
        return '#f59e0b';
      case 'user':
      default:
        return '#3b82f6';
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Gerente';
      case 'user':
      default:
        return 'Usuario';
    }
  }

  if (!user) return null;

  const roleColor = getRoleBadgeColor(user.role);

  return (
    <div className="user-profile-dropdown" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`user-profile-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir menú de usuario"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={user.name}
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" className="user-profile-trigger-image" />
        ) : (
          <User size={18} color="#fff" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="user-profile-menu" role="menu" aria-label="Opciones de usuario">
          <div className="user-profile-menu-header">
            <div className="user-profile-large-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="user-profile-trigger-image" />
              ) : (
                <User size={22} color="#fff" aria-hidden="true" />
              )}
            </div>
            <div className="user-profile-identity">
              <strong title={user.name}>{user.name}</strong>
              <span title={user.email}>{user.email}</span>
              <div
                className="user-profile-role"
                style={{
                  color: roleColor,
                  background: `color-mix(in srgb, ${roleColor} 15%, var(--panel-elevated))`,
                  borderColor: `color-mix(in srgb, ${roleColor} 28%, transparent)`,
                }}
              >
                <Shield size={11} aria-hidden="true" />
                {getRoleLabel(user.role)}
              </div>
            </div>
          </div>

          <div className="user-profile-menu-section">
            <button
              type="button"
              role="menuitem"
              className="user-profile-menu-item"
              onClick={() => {
                setIsOpen(false);
                router.push('/settings');
              }}
            >
              <Settings size={17} aria-hidden="true" />
              <span>Configuración</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="user-profile-menu-item"
              onClick={() => {
                setIsOpen(false);
                window.open('https://wa.me/50588241003', '_blank', 'noopener,noreferrer');
              }}
            >
              <HelpCircle size={17} aria-hidden="true" />
              <span>Ayuda y Soporte</span>
            </button>
          </div>

          <div className="user-profile-menu-section is-logout">
            <button
              type="button"
              role="menuitem"
              className="user-profile-menu-item is-danger"
              onClick={handleLogout}
            >
              <LogOut size={17} aria-hidden="true" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .user-profile-dropdown {
          position: relative;
          z-index: 30;
        }

        .user-profile-trigger {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 50%;
          background: linear-gradient(145deg, #f05252, var(--brand-primary) 58%, #991b1b);
          box-shadow: 0 3px 12px rgba(220, 38, 38, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }

        .user-profile-trigger:hover,
        .user-profile-trigger.is-open {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.55);
          box-shadow: 0 5px 16px rgba(220, 38, 38, 0.34), 0 0 0 3px var(--brand-surface);
        }

        .user-profile-trigger:focus-visible,
        .user-profile-menu-item:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }

        .user-profile-trigger-image {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 50%;
          object-fit: cover;
        }

        .user-profile-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: min(310px, calc(100vw - 24px));
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--brand-primary) 20%, var(--border));
          border-radius: 14px;
          background: linear-gradient(145deg, var(--panel-elevated), var(--panel));
          box-shadow: 0 18px 44px var(--shadow), 0 0 0 1px rgba(255, 255, 255, 0.025), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          animation: profile-menu-in 150ms ease-out both;
        }

        .user-profile-menu-header {
          min-height: 104px;
          padding: 17px 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          border-bottom: 1px solid var(--border);
          background: radial-gradient(ellipse at 0% 0%, var(--brand-surface), transparent 68%), linear-gradient(145deg, var(--panel-2), var(--panel));
        }

        .user-profile-large-avatar {
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.32);
          border-radius: 50%;
          background: linear-gradient(145deg, #f05252, var(--brand-primary) 58%, #991b1b);
          box-shadow: 0 4px 14px rgba(220, 38, 38, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .user-profile-identity {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }

        .user-profile-identity strong {
          max-width: 100%;
          overflow: hidden;
          color: var(--text);
          font-size: 13px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-profile-identity > span {
          max-width: 100%;
          overflow: hidden;
          color: var(--muted);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-profile-role {
          margin-top: 2px;
          padding: 3px 8px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          line-height: 1.2;
        }

        .user-profile-menu-section {
          padding: 7px;
        }

        .user-profile-menu-section + .user-profile-menu-section {
          border-top: 1px solid var(--border);
        }

        .user-profile-menu-section.is-logout {
          background: color-mix(in srgb, var(--panel) 72%, transparent);
        }

        .user-profile-menu-item {
          width: 100%;
          min-height: 40px;
          padding: 9px 10px;
          display: flex;
          align-items: center;
          gap: 11px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: color 140ms ease, background 140ms ease, border-color 140ms ease, transform 140ms ease;
        }

        .user-profile-menu-item:hover {
          transform: translateX(2px);
          border-color: color-mix(in srgb, var(--brand-primary) 18%, transparent);
          background: var(--surface-hover);
          color: var(--text);
        }

        .user-profile-menu-item.is-danger {
          color: var(--danger);
        }

        .user-profile-menu-item.is-danger:hover {
          border-color: color-mix(in srgb, var(--danger) 25%, transparent);
          background: var(--danger-surface);
          color: var(--danger);
        }

        @keyframes profile-menu-in {
          from { opacity: 0; transform: translateY(-5px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .user-profile-trigger,
          .user-profile-menu-item,
          .user-profile-menu {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
