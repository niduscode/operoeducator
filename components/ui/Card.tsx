import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: CardProps) {
  return (
    <div
      className={`bg-white rounded-3xl p-5 md:p-6 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden ${className}`}
    >
      {(title || action) && (
        <div className="flex justify-between items-start md:items-center mb-4 md:mb-6 relative z-10 flex-wrap gap-3">
          <div className="flex-1 min-w-[50%]">
            {subtitle && (
              <p className="text-[9px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                {subtitle}
              </p>
            )}
            {title && (
              <h3 className="text-lg md:text-xl font-light tracking-tight text-slate-900 leading-tight">
                {title}
              </h3>
            )}
          </div>
          {action && <div className="w-full sm:w-auto">{action}</div>}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}