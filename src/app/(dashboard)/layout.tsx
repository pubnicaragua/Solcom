'use client';

import '@/styles/globals.css';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';

import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar(); // Ensure useSidebar is imported from contexts/SidebarContext

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-content">
        <Topbar />
        <main className="dashboard-main">
          {children}
        </main>
      </div>

      <style jsx global>{`
        .dashboard-layout {
          display: grid;
          grid-template-columns: ${isCollapsed ? '80px' : '260px'} 1fr;
          height: 100vh;
          transition: grid-template-columns 0.3s ease;
        }

        .dashboard-content {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .dashboard-main {
          flex: 1;
          overflow: auto;
          padding: 24px;
          background: var(--background);
        }

        /* Tablet */
        @media (max-width: 1024px) {
          .dashboard-layout {
            grid-template-columns: 1fr;
          }

          .dashboard-main {
            padding: 16px;
          }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .dashboard-main {
            padding: 12px;
          }
        }

        @media (max-width: 480px) {
          .dashboard-main {
            padding: 8px;
          }
        }
      `}</style>
    </div>
  );
}
