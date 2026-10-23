import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  const routeNameMap: Record<string, string> = {
    dashboard: 'Overview',
    documents: 'Document Intake & Queue',
    extraction: 'Extraction Studio',
    validation: 'Financial Validation Center',
    review: 'Review Queue & Exceptions',
    history: 'Invoice History Register',
    reports: 'Financial Reports & Exports',
    settings: 'Settings & Audit Log',
  };

  return (
    <nav className="flex items-center text-xs text-[#697586] font-medium" aria-label="Breadcrumb">
      <Link to="/dashboard" className="hover:text-[#172B4D] transition-colors">
        INVOXIS
      </Link>

      {pathnames.length === 0 ? (
        <>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400 shrink-0" />
          <span className="text-[#172B4D] font-semibold">Overview</span>
        </>
      ) : (
        pathnames.map((segment, index) => {
          const isLast = index === pathnames.length - 1;
          const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
          const displayName = routeNameMap[segment] || segment.toUpperCase();

          return (
            <React.Fragment key={routeTo}>
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400 shrink-0" />
              {isLast ? (
                <span className="text-[#172B4D] font-semibold truncate max-w-[200px]" aria-current="page">
                  {displayName}
                </span>
              ) : (
                <Link to={routeTo} className="hover:text-[#172B4D] transition-colors truncate max-w-[150px]">
                  {displayName}
                </Link>
              )}
            </React.Fragment>
          );
        })
      )}
    </nav>
  );
};
