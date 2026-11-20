import { Bell, BellOff, CandlestickChart, Calculator, History, Link2 } from 'lucide-react';

export type ActiveTab = 'terminal' | 'risk' | 'history' | 'bridge';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  alertsEnabled: boolean;
  onToggleAlerts: () => void;
}

const NAV_ITEMS: { id: ActiveTab; label: string; icon: typeof CandlestickChart }[] = [
  { id: 'terminal', label: 'Terminal', icon: CandlestickChart },
  { id: 'risk', label: 'Risk', icon: Calculator },
  { id: 'history', label: 'History', icon: History },
  { id: 'bridge', label: 'Bridge', icon: Link2 },
];

export function Header({ activeTab, onSelectTab, alertsEnabled, onToggleAlerts }: HeaderProps) {
  return (
    <>
      {/* Desktop & Mobile Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 border-b border-[#232834] bg-[#0B0D10]/95 backdrop-blur-md">
        <div className="mx-auto flex h-12 md:h-14 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('terminal')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            SA AI TRADER
          </button>

          {/* Zone 2: Desktop single-line text nav links */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 ${
                    isActive
                      ? 'text-[#F3F4F6]'
                      : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onToggleAlerts}
              aria-pressed={alertsEnabled}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                alertsEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                  : 'border-[#232834] bg-[#12151B] text-[#D1D5DB] hover:border-[#333A4B] hover:text-white'
              }`}
            >
              {alertsEnabled ? (
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{alertsEnabled ? 'Alerts Active' : 'Enable Alerts'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation (Samsung / Android optimized, compact 56px) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#232834] bg-[#0B0D10]/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4 h-14">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                  isActive ? 'text-amber-400' : 'text-[#9CA3AF] active:text-[#F3F4F6]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-[11px] font-medium whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
