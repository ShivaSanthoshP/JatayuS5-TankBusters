import { Outlet } from 'react-router-dom';

import {
  LayoutDashboard, Bot, AlertTriangle, Server, Database, BookOpen, Cpu, Play, Settings,
} from 'lucide-react';
import GlassNavbar from './common/GlassNavbar';
import GlassTab from './common/GlassTab';
import ParticleBackground from './ui/ParticleBackground';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/pipeline', icon: Play, label: 'Pipeline' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/infrastructure', icon: Server, label: 'Infrastructure' },
  { to: '/datasources', icon: Database, label: 'Data Sources' },
  { to: '/simulators', icon: Cpu, label: 'Simulators' },
  { to: '/runbooks', icon: BookOpen, label: 'Runbooks' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      <ParticleBackground />
      {/* ── Floating Liquid Glass Navbar ── */}
      <GlassNavbar className="liquid-glass">
        {/* Left Branding */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-700/30">
            <Server size={20} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[15px] tracking-wide text-slate-900 leading-tight">
              IT<span className="text-emerald-700">Ops</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-800/80 uppercase tracking-wider">
              Orchestrator
            </span>
          </div>
        </div>

        {/* Center: Glass Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 mx-auto">
          {NAV.map((item) => (
            <GlassTab
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              hideIcon={false}
            />
          ))}
        </nav>

        {/* Right Status (Removed System Live indicator per request) */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {/* Future actions/profile can go here */}
        </div>
      </GlassNavbar>

      {/* ── Main Scrollable Content Area ── */}
      <main className="flex-1 overflow-y-auto pt-[110px] w-full">
        <div className="max-w-[1600px] mx-auto w-full px-8 pb-16">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
