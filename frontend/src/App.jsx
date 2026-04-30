import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Phone, Megaphone, BarChart3,
  FileText, Zap, Activity, LogOut, Menu, X, Bot
} from 'lucide-react'

import Dashboard from './pages/Dashboard.jsx'
import Leads from './pages/Leads.jsx'
import CallConsole from './pages/CallConsole.jsx'
import Campaigns from './pages/Campaigns.jsx'
import Analytics from './pages/Analytics.jsx'
import CallLogs from './pages/CallLogs.jsx'
import EnquiryPage from './pages/EnquiryPage.jsx'
import LeadGeneration from './pages/LeadGeneration.jsx'
import LoginPage from './pages/LoginPage.jsx'

// ─── API Helper ───────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.error('[API Error]', path, e.message)
    throw e
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/leads', label: 'Leads', icon: Users, badge: '10' },
  { to: '/call-console', label: 'Call Console', icon: Phone },
  { to: '/lead-generation', label: 'Lead Generation', icon: Zap, badge: 'NEW' },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/call-logs', label: 'Call Logs', icon: FileText },
]

function Sidebar({ activeCalls, user, onLogout, isOpen }) {
  return (
    <aside className={`sidebar${isOpen ? '' : ' sidebar-hidden'}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon"><Phone size={18} color="#fff" /></div>
          <div>
            <div className="logo-text">MantaRay AI</div>
            <div className="logo-sub">Škoda Auto India</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {NAV_ITEMS.map(({ to, label, icon: Icon, badge, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
            {badge && <span className="nav-badge" style={badge === 'NEW' ? { background: '#059669', fontSize: 9 } : {}}>{badge}</span>}
            {label === 'Call Console' && activeCalls > 0 && (
              <span className="nav-badge" style={{ background: '#059669' }}>{activeCalls}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Agent Status + Logout */}
      <div className="sidebar-footer">
        <div className="agent-status-card">
          <div className="agent-avatar"><Bot size={16} color="#fff" /></div>
          <div className="agent-info">
            <div className="agent-name">Maya — AI Voice Agent</div>
            <div className="agent-status-text">
              <span className="status-dot" style={{ background: '#4ba82e' }}></span>
              Online & Ready
            </div>
          </div>
        </div>
        {user && (
          <button className="logout-btn" onClick={onLogout} id="logout-btn">
            <LogOut size={14} />
            <span>Sign out</span>
            <span className="logout-user">({user.username})</span>
          </button>
        )}
      </div>
    </aside>
  )
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

const PAGE_META = {
  '/': { title: 'Dashboard', subtitle: 'Real-time customer overview' },
  '/leads': { title: 'Customer Management', subtitle: 'Manage and qualify your leads' },
  '/call-console': { title: 'Call Console', subtitle: 'AI-powered calling interface' },
  '/lead-generation': { title: 'Lead Generation', subtitle: 'Enquiry pipeline' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Campaign performance tracking' },
  '/analytics': { title: 'Analytics', subtitle: 'Deep-dive metrics' },
  '/call-logs': { title: 'Call Logs', subtitle: 'Complete call history' },
}

function TopBar({ sidebarOpen, onToggleSidebar }) {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const handler = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const meta = PAGE_META[path] || { title: 'MantaRay AI', subtitle: '' }
  const now = new Date().toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <header className={`topbar${sidebarOpen ? '' : ' sidebar-hidden'}`}>
      <div className="topbar-left" style={{ gap: 10 }}>
        {/* Sidebar toggle */}
        <button
          id="sidebar-toggle-btn"
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
        <div>
          <span className="page-title">{meta.title}</span>
          <span className="page-subtitle" style={{ marginLeft: 8 }}>{meta.subtitle}</span>
        </div>
      </div>
      <div className="topbar-right">
        <span className="text-muted" style={{ fontSize: 12 }}>{now}</span>
        <div style={{
          width: 8, height: 8, background: '#4ba82e',
          borderRadius: '50%', boxShadow: '0 0 8px #4ba82e'
        }} />
        <span className="text-sm" style={{ color: '#4ba82e', fontWeight: 600 }}>
          System Online
        </span>
      </div>
    </header>
  )
}

// ─── Layout Wrapper — conditional for /enquiry ───────────────────────────────

function AppLayout({ user, onLogout }) {
  const [activeCalls, setActiveCalls] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  // Enquiry page is standalone — no sidebar, no topbar
  if (location.pathname === '/enquiry') {
    return <EnquiryPage />
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeCalls={activeCalls}
        user={user}
        onLogout={onLogout}
        isOpen={sidebarOpen}
      />
      <div className={`main-content${sidebarOpen ? '' : ' sidebar-hidden'}`}>
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/call-console" element={<CallConsole onActiveCallsChange={setActiveCalls} />} />
            <Route path="/call-console/:leadId" element={<CallConsole onActiveCallsChange={setActiveCalls} />} />
            <Route path="/lead-generation" element={<LeadGeneration />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/call-logs" element={<CallLogs />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('mantaray_user')
    return saved ? JSON.parse(saved) : null
  })

  const handleLogin = (userData) => {
    setUser(userData)
    sessionStorage.setItem('mantaray_user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    sessionStorage.removeItem('mantaray_user')
  }

  // If not authenticated, show login page (except /enquiry is public)
  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/enquiry" element={<EnquiryPage />} />
          <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/enquiry" element={<EnquiryPage />} />
        <Route path="/*" element={<AppLayout user={user} onLogout={handleLogout} />} />
      </Routes>
    </BrowserRouter>
  )
}
