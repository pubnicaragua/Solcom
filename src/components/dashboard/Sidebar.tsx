'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, BarChart3, Settings, Users, HelpCircle, Bot, Menu, X, ClipboardList, Calendar, FolderOpen } from 'lucide-react';
import { useUserRole, hasPermission } from '@/hooks/useUserRole';

const menuItems = [
  { icon: Package, label: 'Inventario', href: '/inventory', module: 'inventory' },
  { icon: BarChart3, label: 'Reportes', href: '/reports', module: 'reports' },
  { icon: Bot, label: 'Agentes IA', href: '/ai-agents', module: 'ai-agents' },
  { icon: FolderOpen, label: 'Entregables', href: '/entregables', module: 'entregables' },
  { icon: Calendar, label: 'Reuniones', href: '/reuniones', module: 'public' },
  { icon: Users, label: 'Roles', href: '/roles', module: 'roles' },
  { icon: Settings, label: 'Configuración', href: '/settings', module: 'settings' },
  { icon: ClipboardList, label: 'Siguientes Pasos', href: '/next-steps', module: 'next-steps' },
  { icon: HelpCircle, label: 'Cómo Funciona', href: '/how-it-works', module: 'public' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { role, loading } = useUserRole();

  return (
    <>
      {/* Botón hamburguesa para móvil */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 1001,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        className="mobile-menu-btn"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay para cerrar el menú en móvil */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
            display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      <aside
        className={`sidebar ${isOpen ? 'open' : ''}`}
        style={{
          background: '#FAF9F6',
          borderRight: '1px solid #E5E4E0',
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          gap: 24,
        }}
      >
      <div style={{ paddingBottom: 18, borderBottom: '1px solid #E5E4E0' }}>
        <div style={{ 
          background: '#FFFFFF', 
          padding: '12px', 
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <img 
            src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png" 
            alt="Solis Comercial" 
            style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block' }}
          />
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          // Ocultar módulos según permisos
          if (!loading && item.module !== 'public' && !hasPermission(role, item.module)) {
            return null;
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? '#DC2626' : '#374151',
                background: isActive ? '#FEE2E2' : 'transparent',
                border: isActive ? '1px solid #DC2626' : '1px solid transparent',
                transition: 'all 0.2s',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#F3F4F6';
                  e.currentTarget.style.color = '#1F2937';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#374151';
                }
              }}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: 12, background: '#F3F4F6', borderRadius: 8, border: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Versión</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}>1.0.0</div>
      </div>
    </aside>

    <style jsx global>{`
      /* Responsive Styles */
      @media (max-width: 1024px) {
        .mobile-menu-btn {
          display: flex !important;
        }
        
        .mobile-overlay {
          display: block !important;
        }
        
        .sidebar {
          position: fixed;
          top: 0;
          left: -280px;
          height: 100vh;
          width: 280px;
          z-index: 1000;
          transition: left 0.3s ease;
          background: var(--card) !important;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
        }
        
        .sidebar.open {
          left: 0;
        }
      }
      
      @media (max-width: 768px) {
        .sidebar {
          width: 260px;
          left: -260px;
        }
      }
    `}</style>
    </>
  );
}
