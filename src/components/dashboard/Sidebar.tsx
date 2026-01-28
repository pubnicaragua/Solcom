'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, BarChart3, Settings, Users, HelpCircle, Bot, Menu, X, ClipboardList, Calendar } from 'lucide-react';

const menuItems = [
  { icon: Package, label: 'Inventario', href: '/inventory' },
  { icon: BarChart3, label: 'Reportes', href: '/reports' },
  { icon: Bot, label: 'Agentes IA', href: '/ai-agents' },
  { icon: Calendar, label: 'Reuniones', href: '/reuniones' },
  { icon: Users, label: 'Roles', href: '/roles' },
  { icon: Settings, label: 'Configuración', href: '/settings' },
  { icon: ClipboardList, label: 'Siguientes Pasos', href: '/next-steps' },
  { icon: HelpCircle, label: 'Cómo Funciona', href: '/how-it-works' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

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
          background: 'var(--panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          gap: 24,
        }}
      >
      <div style={{ paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
        <img 
          src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png" 
          alt="Solis Comercial" 
          style={{ width: '100%', maxWidth: 220, height: 'auto' }}
        />
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? 'var(--brand-primary)' : 'var(--text)',
                background: isActive ? 'rgba(255, 0, 0, 0.1)' : 'transparent',
                border: isActive ? '1px solid var(--brand-primary)' : '1px solid transparent',
                transition: 'all 0.2s',
                textDecoration: 'none',
              }}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: 12, background: 'rgba(255, 0, 0, 0.05)', borderRadius: 6, border: '1px solid rgba(255, 0, 0, 0.2)' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Versión</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>1.0.0</div>
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
