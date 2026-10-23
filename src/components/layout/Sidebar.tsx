import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Files,
  FileSearch,
  ShieldAlert,
  ClipboardCheck,
  History,
  BarChart3,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useInvoices } from '../../context/InvoiceContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { invoices, validationStats } = useInvoices();

  const pendingReviewCount = invoices.filter(
    (i) => i.reviewStatus === 'pending' || i.reviewStatus === 'in_review'
  ).length;

  const criticalIssuesCount = validationStats.criticalIssuesCount;

  // Active check helper
  const isNavActive = (path: string) => {
    if (path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard')) {
      return true;
    }
    if (path === '/extraction' && location.pathname.startsWith('/extraction')) {
      return true;
    }
    return location.pathname === path;
  };

  const navItems = [
    {
      label: 'Overview',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Documents',
      path: '/documents',
      icon: Files,
      badge: invoices.length,
    },
    {
      label: 'Extraction Studio',
      path: '/extraction/inv-84291',
      icon: FileSearch,
    },
    {
      label: 'Validation Center',
      path: '/validation',
      icon: ShieldAlert,
      badge: criticalIssuesCount > 0 ? criticalIssuesCount : undefined,
      badgeVariant: 'danger',
    },
    {
      label: 'Review Queue',
      path: '/review',
      icon: ClipboardCheck,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
      badgeVariant: 'warning',
    },
    {
      label: 'Invoice History',
      path: '/history',
      icon: History,
    },
    {
      label: 'Reports & Exports',
      path: '/reports',
      icon: BarChart3,
    },
    {
      label: 'Settings & Audit',
      path: '/settings',
      icon: Settings,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#172B4D] text-white w-64 border-r border-[#243B5A]">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-[#243B5A] shrink-0">
        <NavLink to="/dashboard" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-md bg-[#356AE6] flex items-center justify-center text-white shadow-xs group-hover:bg-[#2955BF] transition-colors">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>INVOXIS</span>
              <span className="text-[10px] uppercase font-semibold text-[#356AE6] bg-[#243B5A] px-1.5 py-0.2 rounded">
                AI
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-tight">
              Financial Intelligence
            </div>
          </div>
        </NavLink>

        <button
          onClick={onClose}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Workspace Modules
        </div>

        {navItems.map((item) => {
          const active = isNavActive(item.path);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-[#243B5A] text-white border-l-3 border-[#356AE6] shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#243B5A]/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#356AE6]' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
                    item.badgeVariant === 'danger'
                      ? 'bg-[#D64545] text-white'
                      : item.badgeVariant === 'warning'
                      ? 'bg-[#C98512] text-white'
                      : 'bg-[#243B5A] text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Environment / Demo Indicator & Footer */}
      <div className="p-4 border-t border-[#243B5A] bg-[#0F1D33] shrink-0 text-xs">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium">Environment</span>
          <span className="text-[10px] font-mono bg-[#243B5A] text-slate-300 px-1.5 py-0.5 rounded">
            Frontend Prototype
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-tight">
          INVOXIS AI Enterprise v1.4
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          FastAPI & Groq connector ready
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex shrink-0 w-64 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#172B4D] z-50">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
