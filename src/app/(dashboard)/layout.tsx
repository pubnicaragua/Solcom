'use client';

import '@/styles/globals.css';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
          grid-template-columns: 260px 1fr;
          height: 100vh;
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
