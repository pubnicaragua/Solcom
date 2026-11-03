'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SegmentedLoader from '@/components/ui/SegmentedLoader';
import { usePathname } from 'next/navigation';
import { Package, BarChart3, Settings, Users, HelpCircle, Bot, Menu, X, ClipboardList, Calendar, FolderOpen, ArrowLeftRight, FileText, ChevronLeft, ChevronRight, Rocket, ShoppingCart, PackageSearch, Map, CreditCard } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRoleAccess } from '@/hooks/useRoleAccess';

const menuItems = [
  { icon: Package, label: 'Inventario', href: '/inventory', module: 'inventory' },
  { icon: ShoppingCart, label: 'Compras', href: '/compras', module: 'compras', adminOnly: true },
  { icon: FileText, label: 'Facturación', href: '/ventas', module: 'ventas' },
  { icon: PackageSearch, label: 'Alistamiento', href: '/alistamiento', module: 'alistamiento' },
  { icon: Map, label: 'Rutas', href: '/rutas', module: 'rutas' },
  { icon: BarChart3, label: 'Reportes', href: '/reports', module: 'reports' },
  { icon: ArrowLeftRight, label: 'Transferencias', href: '/transfers', module: 'transfers' },
  { icon: Rocket, label: 'Fase 2', href: '/fase2', module: 'fase2' },
  { icon: Calendar, label: 'Reuniones', href: '/reuniones', module: 'reuniones' },
  { icon: Users, label: 'Roles', href: '/roles', module: 'roles' },
  { icon: Settings, label: 'Configuración', href: '/settings', module: 'settings' },
  { icon: Bot, label: 'Agentes IA', href: '/ai-agents', module: 'ai-agents' },
  { icon: CreditCard, label: 'Solcom AI', href: '/solcom-ai', adminOnly: true },
  { icon: ClipboardList, label: 'Siguientes Pasos', href: '/next-steps', module: 'next-steps', hidden: true },
  { icon: HelpCircle, label: 'Cómo Funciona', href: '/how-it-works', module: 'public', hidden: true },
];

const billingSubItems = [
  { label: 'Facturas', href: '/ventas' },
  { label: 'Cotizaciones', href: '/ventas/cotizaciones' },
  { label: 'Listas de Precios', href: '/ventas/listas-precios' },
];

const solcomAISubItems = [
  { label: 'Dashboard', href: '/solcom-ai' },
  { label: 'Créditos', href: '/solcom-ai/creditos' },
];

import { useSidebar } from '@/contexts/SidebarContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close, isCollapsed, toggleCollapse } = useSidebar();
  const { loading, hasModuleAccess, role, error: permissionsError, retry: retryPermissions } = useUserRole();
  const { access: brandingAccess, loading: brandingLoading } = useRoleAccess('branding');
  const canViewBrandLogo = !brandingLoading && brandingAccess.can_view;

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    '/ventas': pathname.startsWith('/ventas'),
    '/solcom-ai': pathname.startsWith('/solcom-ai')
  });

  useEffect(() => {
    setExpandedMenus(prev => ({
      ...prev,
      '/ventas': pathname.startsWith('/ventas'),
      '/solcom-ai': pathname.startsWith('/solcom-ai')
    }));
  }, [pathname]);

  const handleMenuClick = (href: string) => {
    if (href === '/ventas' || href === '/solcom-ai') {
      setExpandedMenus(prev => ({
        ...prev,
        [href]: !prev[href]
      }));
    }
  };

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
            background: 'var(--overlay)',
            zIndex: 999,
            display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      <aside
        className={`sidebar ${isOpen ? 'open' : ''}`}
        style={{
          background: 'var(--sidebar-gradient)',
          borderRight: '1px solid var(--sidebar-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          minHeight: 0,
          padding: isCollapsed ? '18px 10px' : 18,
          gap: 24,
          width: isCollapsed ? 80 : 260,
          transition: 'width 0.3s ease',
          overflowX: 'hidden',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ paddingBottom: 18, borderBottom: '1px solid var(--sidebar-border)', display: 'flex', flexShrink: 0, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
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
            canViewBrandLogo ? (
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
            ) : (
              <div style={{
                background: '#FFFFFF',
                padding: '10px 14px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                marginLeft: 20,
                fontWeight: 800,
                fontSize: 16,
                color: '#111827',
                letterSpacing: 0.4,
              }}>
                SC
              </div>
            )
          )}
        </div>

        <nav
          className="sidebar-navigation"
          style={{
            display: 'flex',
            flex: '1 1 0%',
            flexDirection: 'column',
            gap: 6,
            minHeight: 0,
            overflowX: 'hidden',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {loading && (
            <div style={{ padding: '20px 12px' }}>
              <SegmentedLoader size={40} label={isCollapsed ? '' : 'Cargando menú'} />
            </div>
          )}
          {permissionsError && !loading && (
            <div role="alert" style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
              No se pudieron cargar los permisos.
              <button type="button" onClick={retryPermissions} style={{ display: 'block', marginTop: 8, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer' }}>Reintentar</button>
            </div>
          )}
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isBilling = item.href === '/ventas';
            const isSolcomAI = item.href === '/solcom-ai';
            const isActive = pathname === item.href ||
                            pathname.startsWith(`${item.href}/`) ||
                            (isBilling && pathname.startsWith('/ventas/')) ||
                            (isSolcomAI && pathname.startsWith('/solcom-ai/'));

            // Ocultar items marcados como hidden
            if ((item as any).hidden) {
              return null;
            }

            // Ocultar módulos protegidos mientras carga o si no tiene acceso
            const requiresModuleAccess = !!item.module && item.module !== 'public';
            if (requiresModuleAccess && (loading || !hasModuleAccess(item.module))) {
              // Si falla hasModuleAccess para "compras" (probablemente no exista en DB), y es admin, lo dejamos pasar.
              if (item.adminOnly && role === 'admin') {
                // bypass
              } else {
                return null;
              }
            }

            // Ocultar items solo admin si no es admin
            if ((item as any).adminOnly && role !== 'admin') {
              return null;
            }

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (isBilling || isSolcomAI) {
                      e.preventDefault();
                    }
                    handleMenuClick(item.href);
                  }}
                  title={isCollapsed ? item.label : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: isCollapsed ? '10px 0' : '10px 14px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    borderRadius: 8,
                    position: 'relative',
                    overflow: 'hidden',
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? '#FFFFFF' : 'var(--sidebar-muted)',
                    background: isActive
                      ? 'linear-gradient(105deg, rgba(255,255,255,0.16) 0%, transparent 48%), var(--sidebar-active-gradient)'
                      : 'transparent',
                    border: isActive ? '1px solid color-mix(in srgb, var(--brand-primary) 70%, #ffffff)' : '1px solid transparent',
                    boxShadow: isActive
                      ? '0 5px 16px var(--sidebar-active-glow), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(80,0,12,0.18)'
                      : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--sidebar-hover)';
                      e.currentTarget.style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--sidebar-muted)';
                    }
                  }}
                >
                  <Icon size={20} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>

                {!isCollapsed && isBilling && expandedMenus[item.href] && (
                  <div style={{
                    marginTop: 4,
                    marginBottom: 8,
                    marginLeft: 23,
                    paddingLeft: 14,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {/* Linea vertical sutil de conexión */}
                    <div style={{
                      position: 'absolute',
                      top: -4,
                      bottom: 16,
                      left: 0,
                      width: 1,
                      backgroundColor: 'var(--sidebar-border)'
                    }} />

                    {billingSubItems.map((sub) => {
                      const isSubActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          style={{
                            position: 'relative',
                            fontSize: 13,
                            borderRadius: 6,
                            padding: '6px 10px',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                            display: 'block',
                            color: isSubActive ? 'var(--brand-primary)' : 'var(--sidebar-muted)',
                            background: isSubActive ? 'var(--brand-surface)' : 'transparent',
                            border: isSubActive ? '1px solid var(--brand-primary)' : '1px solid transparent',
                          }}
                        >
                          {/* Conexión horizontal con la linea principal */}
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: -14,
                            width: 14,
                            height: 1,
                            backgroundColor: 'var(--sidebar-border)'
                          }} />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {!isCollapsed && isSolcomAI && expandedMenus[item.href] && (
                  <div style={{
                    marginTop: 4,
                    marginBottom: 8,
                    marginLeft: 23,
                    paddingLeft: 14,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {/* Linea vertical sutil de conexión */}
                    <div style={{
                      position: 'absolute',
                      top: -4,
                      bottom: 16,
                      left: 0,
                      width: 1,
                      backgroundColor: 'var(--sidebar-border)'
                    }} />

                    {solcomAISubItems.map((sub) => {
                      const isSubActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          style={{
                            position: 'relative',
                            fontSize: 13,
                            borderRadius: 6,
                            padding: '6px 10px',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                            display: 'block',
                            color: isSubActive ? 'var(--brand-primary)' : 'var(--sidebar-muted)',
                            background: isSubActive ? 'var(--brand-surface)' : 'transparent',
                            border: isSubActive ? '1px solid var(--brand-primary)' : '1px solid transparent',
                          }}
                        >
                          {/* Conexión horizontal con la linea principal */}
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: -14,
                            width: 14,
                            height: 1,
                            backgroundColor: 'var(--sidebar-border)'
                          }} />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer with Toggle Button */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 18, marginTop: 'auto', flexShrink: 0 }}>
          <button
            onClick={toggleCollapse}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--sidebar-muted)',
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
              e.currentTarget.style.background = 'var(--sidebar-hover)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--sidebar-muted)';
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
      .sidebar-navigation {
        scrollbar-width: none;
        -ms-overflow-style: none;
        -webkit-overflow-scrolling: touch;
      }

      .sidebar-navigation::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }

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
          background: var(--sidebar-gradient) !important;
          box-shadow: 2px 0 8px var(--shadow);
        }
        
        .sidebar.open {
          left: 0;
        }
      }
      
      @media (max-width: 768px) {
        .sidebar {
          width: 260px;
          background: var(--sidebar-gradient) !important;
          left: -260px;
        }
      }
    `}</style>
    </>
  );
}
