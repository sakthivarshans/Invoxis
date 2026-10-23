import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Building2,
  ChevronDown,
  X,
  FileText,
} from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
import { useInvoices } from '../../context/InvoiceContext';

interface HeaderProps {
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar }) => {
  const navigate = useNavigate();
  const { invoices, validationIssues } = useInvoices();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Profile menu state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Filter invoices for search
  const filteredInvoices = searchQuery.trim()
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inv.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inv.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  // Click outside listeners
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const criticalIssues = validationIssues.filter((i) => i.severity === 'critical');
  const pendingInvoices = invoices.filter((i) => i.reviewStatus === 'pending');

  return (
    <header className="h-16 bg-white border-b border-[#E3E8F0] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-2 text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF] rounded-lg"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* Center/Right Actions: Global Search, Notifications, Profile */}
      <div className="flex items-center gap-3">
        {/* Global Search Bar */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center bg-[#F7F9FC] border border-[#E3E8F0] focus-within:border-[#356AE6] rounded-lg px-2.5 py-1.5 w-44 sm:w-64 transition-all">
            <Search className="w-4 h-4 text-[#697586] mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search invoices, vendors..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-full bg-transparent text-xs text-[#172B4D] placeholder-[#697586] focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="text-[#697586] hover:text-[#172B4D]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-[#E3E8F0] p-2 z-50 animate-in fade-in-50 duration-100">
              <div className="text-[11px] font-semibold text-[#697586] px-2 py-1 uppercase tracking-wider">
                Matching Invoices
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="p-3 text-center text-xs text-[#697586]">
                  No matching invoice found
                </div>
              ) : (
                filteredInvoices.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => {
                      setIsSearchOpen(false);
                      setSearchQuery('');
                      navigate(`/extraction/${inv.id}`);
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-[#F2F6FF] transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-[#172B4D] group-hover:text-[#356AE6] truncate flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 shrink-0 text-[#697586]" />
                        {inv.invoiceNumber || 'No Number'}
                      </div>
                      <div className="text-[11px] text-[#697586] truncate">
                        {inv.vendorName || inv.fileName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-medium text-[#172B4D]">
                        {inv.currency} {inv.grandTotal.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase">
                        {inv.processingStatus}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Notifications Icon & Popover */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 text-[#697586] hover:text-[#172B4D] hover:bg-[#F2F6FF] rounded-lg relative transition-colors"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            {criticalIssues.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D64545]" />
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-84 bg-white rounded-lg shadow-xl border border-[#E3E8F0] p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-[#E3E8F0] mb-2">
                <span className="text-xs font-semibold text-[#172B4D]">Financial Alerts</span>
                <span className="text-[10px] font-mono bg-[#FEF3F2] text-[#D64545] font-semibold px-2 py-0.5 rounded">
                  {criticalIssues.length} Critical
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {criticalIssues.slice(0, 4).map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => {
                      setIsNotificationsOpen(false);
                      navigate(`/extraction/${issue.invoiceId}`);
                    }}
                    className="p-2 rounded-md hover:bg-[#F7F9FC] cursor-pointer transition-colors border border-transparent hover:border-[#E3E8F0]"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#D64545] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#172B4D] truncate">
                          {issue.invoiceNumber}: {issue.ruleTitle}
                        </p>
                        <p className="text-[11px] text-[#697586] line-clamp-2 mt-0.5">
                          {issue.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {pendingInvoices.length > 0 && (
                  <div className="pt-2 border-t border-[#E3E8F0]">
                    <div className="text-[11px] text-[#697586] flex items-center justify-between px-1">
                      <span>{pendingInvoices.length} invoices pending review</span>
                      <button
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          navigate('/review');
                        }}
                        className="text-[#356AE6] font-medium hover:underline text-xs"
                      >
                        Open Queue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Workspace Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-[#F2F6FF] transition-colors border border-transparent hover:border-[#E3E8F0]"
          >
            <div className="w-7 h-7 rounded-md bg-[#172B4D] text-white flex items-center justify-center font-semibold text-xs">
              FW
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-[#172B4D] leading-tight">
                Finance Workspace
              </div>
              <div className="text-[10px] text-[#697586] leading-tight">
                Lead Financial Analyst
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#697586]" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-[#E3E8F0] p-2 z-50">
              <div className="p-2 border-b border-[#E3E8F0] mb-1">
                <p className="text-xs font-semibold text-[#172B4D]">Finance Workspace</p>
                <p className="text-[11px] text-[#697586]">Enterprise Role: Finance Lead</p>
                <span className="inline-block mt-1 text-[10px] bg-[#ECFDF3] text-[#16865C] font-medium px-1.5 py-0.5 rounded">
                  Full Approval Clearance
                </span>
              </div>
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  navigate('/settings');
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-[#172B4D] hover:bg-[#F2F6FF] rounded-md transition-colors"
              >
                Workspace Configuration
              </button>
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  navigate('/history');
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-[#172B4D] hover:bg-[#F2F6FF] rounded-md transition-colors"
              >
                Audited Invoices Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
