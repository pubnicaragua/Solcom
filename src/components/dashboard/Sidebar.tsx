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
          top: 12,
          left: 16,
          zIndex: 1001,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'none', // Hidden on desktop via CSS
          alignItems: 'center',
          gap: 8
        }}
        className="mobile-menu-btn"
      >
        {/* Solo mostramos el logo si el menú está CERRADO. Si está abierto, el Sidebar ya muestra el logo dentro. */}
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
          background: '#1F2937',
          borderRight: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          gap: 24,
        }}
      >
        <div style={{ paddingBottom: 18, borderBottom: '1px solid #374151' }}>
          <div style={{
            background: '#FFFFFF',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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

            // Mostrar módulos públicos siempre, o verificar permisos si ya cargó
            if (item.module !== 'public' && !loading && !hasPermission(role, item.module)) {
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
                  color: isActive ? '#FFFFFF' : '#D1D5DB',
                  background: isActive ? '#DC2626' : 'transparent',
                  border: isActive ? '1px solid #DC2626' : '1px solid transparent',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#374151';
                    e.currentTarget.style.color = '#FFFFFF';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#D1D5DB';
                  }
                }}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 12, background: '#374151', borderRadius: 8, border: '1px solid #4B5563' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>Versión</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F9FAFB' }}>1.0.0</div>
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
          background: #1F2937 !important;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
        }
        
        .sidebar.open {
          left: 0;
        }
      }
      
      @media (max-width: 768px) {
        .sidebar {
          width: 260px;
          background: #1F2937 !important;
          left: -260px;
        }
      }
    `}</style>
    </>
  );
}
