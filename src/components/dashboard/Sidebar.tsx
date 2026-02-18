'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, BarChart3, Settings, Users, HelpCircle, Bot, Menu, X, ClipboardList, Calendar, FolderOpen, ArrowLeftRight, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUserRole, hasPermission } from '@/hooks/useUserRole';

const menuItems = [
  { icon: Package, label: 'Inventario', href: '/inventory', module: 'inventory' },
  { icon: ShoppingCart, label: 'Ventas', href: '/ventas', module: 'ventas' },
  { icon: BarChart3, label: 'Reportes', href: '/reports', module: 'reports' },
  { icon: Bot, label: 'Agentes IA', href: '/ai-agents', module: 'ai-agents' },
  { icon: ArrowLeftRight, label: 'Transferencias', href: '/transfers', module: 'transfers' },
  { icon: Calendar, label: 'Reuniones', href: '/reuniones', module: 'public' },
  { icon: Users, label: 'Roles', href: '/roles', module: 'roles' },
  { icon: Settings, label: 'Configuración', href: '/settings', module: 'settings' },
  { icon: ClipboardList, label: 'Siguientes Pasos', href: '/next-steps', module: 'next-steps' },
  { icon: HelpCircle, label: 'Cómo Funciona', href: '/how-it-works', module: 'public' },
];

import { useSidebar } from '@/contexts/SidebarContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close, isCollapsed, toggleCollapse } = useSidebar();
  const { role, loading } = useUserRole();
  console.log('Sidebar Role:', role, 'Loading:', loading);

  return (
    <>
      {/* Overlay para cerrar el menú en móvil */}
      {isOpen && (
        <div
          onClick={close}
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
          padding: isCollapsed ? '18px 10px' : 18,
          gap: 24,
          width: isCollapsed ? 80 : 260,
          transition: 'width 0.3s ease',
          overflowX: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ paddingBottom: 18, borderBottom: '1px solid #374151', display: 'flex', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          {isCollapsed ? (
            <div style={{
              background: '#FFFFFF',
              width: 40,
              height: 40,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#000'
            }}>SC</div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              padding: '8px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              marginLeft: 20,
            }}>
              <img
                src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
                alt="Solis Comercial"
                style={{ width: '100', maxWidth: 160, height: 'auto', display: 'block' }}
              />
            </div>
          )}
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
                title={isCollapsed ? item.label : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isCollapsed ? '10px 0' : '10px 14px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? '#FFFFFF' : '#D1D5DB',
                  background: isActive ? '#DC2626' : 'transparent',
                  border: isActive ? '1px solid #DC2626' : '1px solid transparent',
                  cursor: 'pointer',
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
                <Icon size={20} />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer with Toggle Button */}
        <div style={{ borderTop: '1px solid #374151', paddingTop: 18, marginTop: 'auto', marginBottom: 50 }}>
          <button
            onClick={toggleCollapse}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
              padding: isCollapsed ? '10px 0' : '10px 14px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: 12,
              width: '100%',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#374151';
              e.currentTarget.style.color = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#9CA3AF';
            }}
            title={isCollapsed ? "Expandir menú" : "Contraer menú"}
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <>
                <ChevronLeft size={20} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Contraer menú</span>
              </>
            )}
          </button>
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
