import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Phone, TrendingUp, Flame, Thermometer,
  Snowflake, PhoneCall, CheckCircle, Activity, Play, ChevronRight
} from 'lucide-react'
import { apiFetch } from '../App.jsx'

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color = '#4f46e5' }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80, h = 32
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.8 }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
    </svg>
  )
}

// ─── Recent lead row ─────────────────────────────────────────────────────────
function LeadRow({ lead, onCall }) {
  const navigate = useNavigate()
  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/call-console/${lead.lead_id}`)}
    >
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="lead-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
            {lead.name[0]}{lead.name.split(' ')[1]?.[0] || ''}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{lead.name}</span>
              {lead.preferred_language && (() => {
                const cfg = {
                  english:  { label: '🌐 EN',  bg: 'rgba(99,102,241,0.13)', border: 'rgba(99,102,241,0.4)',  color: '#a5b4fc' },
                  hindi:    { label: '🇮🇳 HI',  bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.4)',  color: '#fb923c' },
                  hinglish: { label: '🔀 HIN',  bg: 'rgba(74,222,128,0.13)', border: 'rgba(74,222,128,0.4)',  color: '#4ade80' },
                }[lead.preferred_language]
                return cfg ? (
                  <span style={{
                    padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                  }}>{cfg.label}</span>
                ) : null
              })()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.email}</div>
          </div>
        </div>
      </td>
      <td>{lead.phone}</td>
      <td>{lead.preferences?.location || '—'}</td>
      <td>{lead.preferences?.vehicle_model || '—'}</td>
      <td>
        <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
      </td>
      <td>
        <span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span>
      </td>
      <td>
        <button
          id={`call-btn-${lead.lead_id}`}
          className="topbar-btn btn-primary"
          style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={e => { e.stopPropagation(); onCall(lead) }}
        >
          <PhoneCall size={12} /> Call
        </button>
      </td>
    </tr>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null)
  const [leads, setLeads] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch('/api/analytics').then(setAnalytics).catch(() => {})
    apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})
  }, [])

  const stats = analytics || {
    total_leads: 5, hot_leads: 2, warm_leads: 2, cold_leads: 1,
    contacted: 1, qualified: 1, calls_today: 0, total_calls: 0,
    conversion_rate: 20, monthly_revenue: '₹12,40,000', pipeline_value: '₹8,50,00,000'
  }

  const statCards = [
    {
      label: 'Total Leads',
      value: stats.total_leads,
      icon: Users,
      color: '#4f46e5',
      bg: 'rgba(79,70,229,0.08)',
      gradient: 'linear-gradient(90deg, #4f46e5, #6366f1)',
      change: '+12%',
      up: true,
      spark: [3, 4, 3, 5, 4, 5, 6, 5]
    },
    {
      label: 'Hot Leads',
      value: stats.hot_leads,
      icon: Flame,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.1)',
      gradient: 'linear-gradient(90deg, #ef4444, #f97316)',
      change: '+8%',
      up: true,
      spark: [1, 2, 1, 2, 2, 3, 2, 3]
    },
    {
      label: 'Warm Leads',
      value: stats.warm_leads,
      icon: Thermometer,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
      gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
      change: '+3%',
      up: true,
      spark: [2, 2, 2, 3, 2, 2, 3, 2]
    },
    {
      label: 'Cold Leads',
      value: stats.cold_leads,
      icon: Snowflake,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.1)',
      gradient: 'linear-gradient(90deg, #3b82f6, #6366f1)',
      change: '-5%',
      up: false,
      spark: [2, 2, 1, 1, 1, 1, 1, 1]
    },
    {
      label: 'Calls Today',
      value: stats.calls_today,
      icon: Phone,
      color: '#06b6d4',
      bg: 'rgba(6,182,212,0.1)',
      gradient: 'linear-gradient(90deg, #06b6d4, #0ea5e9)',
      change: '+20%',
      up: true,
      spark: [0, 1, 0, 1, 1, 2, 2, 3]
    },
    {
      label: 'Qualified',
      value: stats.qualified,
      icon: CheckCircle,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      gradient: 'linear-gradient(90deg, #10b981, #34d399)',
      change: '+15%',
      up: true,
      spark: [0, 0, 1, 1, 1, 1, 1, 1]
    },
    {
      label: 'Conversion',
      value: `${stats.conversion_rate}%`,
      icon: TrendingUp,
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.08)',
      gradient: 'linear-gradient(90deg, #6366f1, #818cf8)',
      change: '+2.1%',
      up: true,
      spark: [15, 16, 18, 17, 19, 20, 19, 20]
    },
    {
      label: 'Pipeline Value',
      value: '₹6.4Cr',
      icon: Activity,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
      gradient: 'linear-gradient(90deg, #f59e0b, #ef4444)',
      change: '+18%',
      up: true,
      spark: [6, 7, 7, 8, 7, 8, 8, 9]
    },
  ]

  return (
    <div className="animate-fadeInUp">
      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(8,145,178,0.04) 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px 32px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 80% 50%, rgba(79,70,229,0.04) 0%, transparent 60%)',
          pointerEvents: 'none'
        }} />
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
            👋 Welcome back, Admin
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            You have <strong style={{ color: '#4f46e5' }}>{stats.hot_leads} hot leads</strong> ready for follow-up today.
            Maya is standing by.
          </p>
        </div>
        <button
          id="start-campaign-btn"
          className="topbar-btn btn-primary"
          style={{ fontSize: 14, padding: '12px 24px', gap: 8 }}
          onClick={() => navigate('/call-console')}
        >
          <Play size={16} fill="currentColor" />
          Start Calling
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {statCards.map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.gradient, animationDelay: `${i * 0.05}s` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon" style={{ background: s.bg }}>
                <s.icon size={18} color={s.color} />
              </div>
              <Sparkline data={s.spark} color={s.color} />
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-change ${s.up ? 'up' : 'down'}`}>
              {s.up ? '↑' : '↓'} {s.change} this month
            </div>
          </div>
        ))}
      </div>

      {/* Recent Leads Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Leads</span>
          <button
            className="topbar-btn btn-ghost"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => navigate('/leads')}
          >
            View All <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Vehicle</th>
                <th>Tag</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 5).map(lead => (
                <LeadRow
                  key={lead.lead_id}
                  lead={lead}
                  onCall={lead => navigate(`/call-console/${lead.lead_id}`)}
                />
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    Loading leads...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
