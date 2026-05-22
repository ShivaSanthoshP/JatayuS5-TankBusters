import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--lp-line)] px-5 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[var(--lp-blue)]" />
          <span className="font-display text-[20px] leading-none tracking-tight text-[var(--lp-ink)]">
            ITOps Orchestrator
          </span>
          <span className="text-[12px] text-[var(--lp-ink-soft)]">· Built by Team Tank Busters</span>
        </div>
        <nav className="flex items-center gap-5 text-[13px] font-medium text-[var(--lp-ink-soft)]">
          <Link to="/dashboard" className="transition-colors duration-200 hover:text-[var(--lp-ink)]">
            Enter app
          </Link>
          <a href="/docs" className="transition-colors duration-200 hover:text-[var(--lp-ink)]">
            API docs
          </a>
          <span className="text-[var(--lp-ink-soft)]">© 2026</span>
        </nav>
      </div>
    </footer>
  );
}
