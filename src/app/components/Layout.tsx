import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { Cpu, Activity, GitCompare, History, Menu, X, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAppContext } from '../../context/AppContext';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { history, removeFromHistory, clearAllHistory } = useAppContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/',        label: 'Analyzer', icon: Cpu       },
    { path: '/results', label: 'Results',  icon: Activity  },
    { path: '/compare', label: 'Compare',  icon: GitCompare },
  ];

  const scoreColor = (score: number) =>
    score > 70 ? 'text-destructive' : score > 40 ? 'text-warning' : 'text-primary';

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromHistory(id);
    toast.success('Item removed from history');
  };

  const handleClearHistory = () => {
    clearAllHistory();
    toast.success('History cleared');
  };

  const handleHistoryClick = (id: string) => {
    toast.info('Load from history — connect backend to restore full results');
    setHistoryOpen(false);
  };

  return (
    <div className="min-h-screen relative">
      {/* Navbar */}
      <nav className="glass-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="group flex items-center gap-3 rounded-xl border border-primary/25 bg-[linear-gradient(145deg,rgba(78,120,255,0.1),rgba(12,20,36,0.88))] px-3 py-2 shadow-[0_0_16px_rgba(78,120,255,0.12)] transition-all hover:border-primary/45 hover:shadow-[0_0_24px_rgba(78,120,255,0.2)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-primary/35 bg-[radial-gradient(circle_at_30%_20%,rgba(111,212,255,0.2),rgba(78,120,255,0.1)_45%,rgba(10,18,30,0.95)_90%)]">
                <Cpu className="h-6 w-6 text-primary neon-glow" />
                <div className="absolute inset-0 rounded-lg bg-primary/14 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
              </div>
              <div className="leading-tight">
                <h1 className="text-[1.55rem] sm:text-[1.75rem] neon-text">ManipuLens AI</h1>
                <p className="text-xs tracking-[0.04em] text-muted-foreground">Manipulation Detection & Analysis</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary/20 text-primary neon-glow border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ml-2 ${
                  historyOpen
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <History className="w-4 h-4" />
                <span>History</span>
                {history.length > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-mono leading-none">
                    {history.length > 9 ? '9+' : history.length}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-secondary/50 transition-all"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-foreground" />
              ) : (
                <Menu className="w-6 h-6 text-foreground" />
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-2 space-y-1 border-t border-border pt-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm w-full ${
                      isActive
                        ? 'bg-primary/20 text-primary neon-glow border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => { setMobileMenuOpen(false); setHistoryOpen(true); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all w-full text-sm"
              >
                <History className="w-4 h-4" />
                <span>History</span>
                {history.length > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-mono leading-none ml-auto">
                    {history.length > 9 ? '9+' : history.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10">
        <Outlet />
      </main>

      {/* History Drawer */}
      {historyOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="fixed right-4 top-20 z-50 glass-card neon-glow rounded-xl p-6 w-full max-w-sm max-h-[75vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-base">
                <History className="w-5 h-5 text-primary" />
                Analysis History
                {history.length > 0 && (
                  <span className="text-xs font-mono text-muted-foreground">({history.length})</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10"
                    title="Clear all history"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No analyses yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Analyze content to see your history here.</p>
                <button
                  onClick={() => { setHistoryOpen(false); navigate('/'); }}
                  className="mt-4 px-4 py-2 rounded-lg bg-primary/20 text-primary border border-primary/40 text-sm hover:bg-primary/30 transition-all"
                >
                  Start Analyzing
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleHistoryClick(item.id)}
                    className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm mb-1 leading-tight flex-1 min-w-0 truncate">{item.title}</p>
                      <button
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0 p-0.5 rounded"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.date}</span>
                      <span className={`font-mono ${scoreColor(item.score)}`}>
                        {item.score}% risk
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
