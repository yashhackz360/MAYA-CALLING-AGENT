import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Phone, TrendingUp, Flame, Thermometer,
  Snowflake, PhoneCall, CheckCircle, Activity, Play,
  ChevronRight, X, Bell, ArrowUpRight, ArrowDownRight,
  Target, Zap, PhoneIncoming, Mic
} from 'lucide-react'
import { apiFetch, API_BASE } from '../App.jsx'

// ── Mini bar chart (replaces sparkline) ──────────────────────────────────────
function MiniBar({ data, color }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, width: 56, flexShrink: 0 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(10, (v / max) * 100)}%`,
          borderRadius: '3px 3px 0 0',
          background: color,
          opacity: 0.25 + (i / (data.length - 1)) * 0.75,
          transition: 'height 0.4s ease',
        }} />
      ))}
    </div>
  )
}

// ── Lead row ──────────────────────────────────────────────────────────────────
function LeadRow({ lead, onCall }) {
  const navigate = useNavigate()
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => navigate('/leads')}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="lead-avatar" style={{ width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>
            {lead.name[0]}{lead.name.split(' ')[1]?.[0] || ''}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{lead.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.email}</div>
          </div>
        </div>
      </td>
      <td style={{ fontSize: 12 }}>{lead.phone}</td>
      <td style={{ fontSize: 12 }}>{lead.preferences?.vehicle_model || '—'}</td>
      <td><span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span></td>
      <td><span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span></td>
      <td>
        <button
          className="topbar-btn btn-call"
          style={{ padding: '5px 12px', fontSize: 12 }}
          onClick={e => { e.stopPropagation(); onCall(lead) }}
        >
          <PhoneCall size={12} /> Call
        </button>
      </td>
    </tr>
  )
}

// ── Toast notification (fixed top-right) ─────────────────────────────────────
function LeadToast({ notif, onDismiss }) {
  const navigate = useNavigate()
  const lead = notif.lead || {}
  const initials = lead.name
    ? lead.name[0] + (lead.name.split(' ')[1]?.[0] || '')
    : '?'
  const [progress, setProgress] = React.useState(100)
  const AUTO_DISMISS_MS = 9000

  React.useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      setProgress(Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100))
    }, 50)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      width: 360,
      background: 'var(--bg-card, #1a2035)',
      border: '1px solid rgba(99,102,241,0.28)',
      borderRadius: 16,
      boxShadow: '0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.10)',
      overflow: 'hidden',
      animation: 'toastSlideIn 0.38s cubic-bezier(0.34,1.56,0.64,1)',
      position: 'relative',
    }}>
      {/* Top accent bar */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #6366f1, #0ea5e9, #10b981)',
      }} />

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Pulsing bell */}
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          animation: 'bellPulse 1.4s ease-in-out 2',
        }}>
          <PhoneIncoming size={13} color="#6366f1" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            🔔 New Enquiry Received
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Lead info */}
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #0ea5e9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800, color: '#fff',
          boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
        }}>{initials}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lead.name || 'Unknown Lead'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
            {lead.phone && <span>📱 {lead.phone}</span>}
            {lead.preferences?.vehicle_model && <span>🚗 {lead.preferences.vehicle_model}</span>}
            {lead.preferences?.location && <span>📍 {lead.preferences.location}</span>}
            {lead.source && <span>🌐 {lead.source}</span>}
          </div>
        </div>

        {lead.tag && (
          <span className={`badge badge-${lead.tag?.toLowerCase()}`} style={{ flexShrink: 0, fontSize: 10 }}>
            {lead.tag}
          </span>
        )}
      </div>

      {/* Maya AI status strip */}
      <div style={{
        margin: '0 14px 12px',
        padding: '10px 12px',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(6,182,212,0.08))',
        border: '1px solid rgba(16,185,129,0.22)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Animated waveform */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {[1, 1.6, 1.2, 1.8, 1.0].map((h, i) => (
            <div key={i} style={{
              width: 3, height: `${h * 10}px`,
              background: 'linear-gradient(180deg, #10b981, #06b6d4)',
              borderRadius: 2,
              animation: `waveBar 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
            }} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>Maya AI — Automated Call in Progress</div>
          <div style={{ fontSize: 10, color: 'rgba(16,185,129,0.70)', marginTop: 1 }}>Engaging lead via AI voice agent…</div>
        </div>
        <Mic size={13} color="#10b981" style={{ flexShrink: 0 }} />
      </div>

      {/* Action row */}
      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
        <button
          className="topbar-btn btn-primary"
          style={{ flex: 1, fontSize: 11, padding: '7px 10px', justifyContent: 'center' }}
          onClick={() => { navigate('/leads'); onDismiss() }}
        >
          View Lead
        </button>
        <button
          className="topbar-btn btn-ghost"
          style={{ fontSize: 11, padding: '7px 12px' }}
          onClick={() => { navigate('/call-logs'); onDismiss() }}
        >
          Call Logs
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #6366f1, #0ea5e9)',
          transition: 'width 0.05s linear',
        }} />
      </div>
    </div>
  )
}

// ── Pipeline bar ──────────────────────────────────────────────────────────────
function PipelineBar({ label, count, total, color, icon: Icon }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          <Icon size={13} color={color} /> {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 7, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null)
  const [leads, setLeads] = useState([])
  const [notifications, setNotifications] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch('/api/analytics').then(setAnalytics).catch(() => {})
    apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const wsBase = API_BASE.replace(/^https?/, m => m === 'https' ? 'wss' : 'ws')
    let ws, pingTimer
    const connect = () => {
      try {
        ws = new WebSocket(`${wsBase}/ws/crm`)
        ws.onopen = () => {
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
          }, 25000)
        }
        ws.onmessage = e => {
          try {
            const data = JSON.parse(e.data)
            if (data.type === 'new_lead' && data.lead) {
              const notif = { id: Date.now(), ...data }
              setNotifications(prev => [notif, ...prev].slice(0, 4))
              setLeads(prev => prev.find(l => l.lead_id === data.lead.lead_id) ? prev : [data.lead, ...prev])
              setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 8000)
            }
          } catch {}
        }
        ws.onerror = () => {}
        ws.onclose = () => clearInterval(pingTimer)
      } catch {}
    }
    connect()
    return () => { clearInterval(pingTimer); try { ws?.close() } catch {} }
  }, [])

  const stats = analytics || {
    total_leads: 5, hot_leads: 2, warm_leads: 2, cold_leads: 1,
    contacted: 1, qualified: 1, calls_today: 0, total_calls: 0,
    conversion_rate: 20,
  }

  const kpiCards = [
    { label: 'Total Leads',     value: stats.total_leads,        icon: Users,       color: '#2563eb', spark: [3,4,3,5,4,5,6,5],        change: '+12%', up: true  },
    { label: 'Hot Leads',       value: stats.hot_leads,          icon: Flame,       color: '#ef4444', spark: [1,2,1,2,2,3,2,3],        change: '+8%',  up: true  },
    { label: 'Calls Today',     value: stats.calls_today,        icon: Phone,       color: '#6366f1', spark: [0,1,0,1,1,2,2,3],        change: '+20%', up: true  },
    { label: 'Qualified',       value: stats.qualified,          icon: CheckCircle, color: '#16a34a', spark: [0,0,1,1,1,1,1,1],        change: '+15%', up: true  },
    { label: 'Warm Leads',      value: stats.warm_leads,         icon: Thermometer, color: '#f59e0b', spark: [2,2,2,3,2,2,3,2],        change: '+3%',  up: true  },
    { label: 'Cold Leads',      value: stats.cold_leads,         icon: Snowflake,   color: '#0ea5e9', spark: [2,2,1,1,1,1,1,1],        change: '-5%',  up: false },
    { label: 'Conversion Rate', value: `${stats.conversion_rate}%`, icon: TrendingUp, color: '#8b5cf6', spark: [15,16,18,17,19,20,19,20], change: '+2.1%',up: true  },
    { label: 'Total Calls',     value: stats.total_calls,        icon: Activity,    color: '#f97316', spark: [6,7,7,8,7,8,8,9],        change: '+18%', up: true  },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="animate-fadeInUp">

      {/* ── Toast Notifications (fixed top-right) ───────────────────────── */}
      {notifications.length > 0 && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 10,
          pointerEvents: 'none',
        }}>
          {notifications.map(n => (
            <div key={n.id} style={{ pointerEvents: 'all' }}>
              <LeadToast
                notif={n}
                onDismiss={() => setNotifications(p => p.filter(x => x.id !== n.id))}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #0369a1 100%)',
        borderRadius: 20, padding: '28px 32px', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(37,99,235,0.28)',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', right: -40, top: -40, width: 220, height: 220, background: 'rgba(255,255,255,0.04)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -60, width: 160, height: 160, background: 'rgba(255,255,255,0.04)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {greeting}, Admin
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.4px' }}>
            {stats.hot_leads} hot lead{stats.hot_leads !== 1 ? 's' : ''} need attention today
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: 0 }}>
            Maya is online and ready to call. {stats.total_leads} leads in pipeline · {stats.conversion_rate}% conversion rate.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, position: 'relative', zIndex: 1 }}>
          <button
            className="topbar-btn"
            style={{ fontSize: 13, padding: '11px 20px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', backdropFilter: 'blur(8px)' }}
            onClick={() => navigate('/campaigns')}
          >
            <Target size={14} /> Campaigns
          </button>
          <button
            className="topbar-btn"
            style={{ fontSize: 13, padding: '11px 22px', background: '#fff', color: '#1d4ed8', fontWeight: 700, border: 'none' }}
            onClick={() => navigate('/leads')}
          >
            <Play size={14} fill="#1d4ed8" /> Start Calling
          </button>
        </div>
      </div>

      {/* ── KPI Cards (4 × 2) ────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 24,
      }}>
        {kpiCards.map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': `linear-gradient(90deg, ${s.color}, ${s.color}88)`, animationDelay: `${i * 0.04}s` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${s.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <s.icon size={17} color={s.color} />
              </div>
              <MiniBar data={s.spark} color={s.color} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: s.up ? '#16a34a' : '#ef4444' }}>
              {s.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {s.change} this month
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom row: leads table + pipeline panel ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18 }}>

        {/* Recent Leads */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Leads</span>
            <button className="topbar-btn btn-ghost" style={{ fontSize: 12, padding: '5px 11px' }} onClick={() => navigate('/leads')}>
              View All <ChevronRight size={13} />
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Tag</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 6).map(lead => (
                  <LeadRow
                    key={lead.lead_id}
                    lead={lead}
                    onCall={async lead => {
                      try { await apiFetch(`/api/leads/${lead.lead_id}/call`, { method: 'POST' }) } catch {}
                    }}
                  />
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      Loading leads...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Pipeline breakdown */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Lead Pipeline</span>
            </div>
            <div style={{ padding: '4px 20px 20px' }}>
              <PipelineBar label="Hot"  count={stats.hot_leads}  total={stats.total_leads} color="#ef4444" icon={Flame} />
              <PipelineBar label="Warm" count={stats.warm_leads} total={stats.total_leads} color="#f59e0b" icon={Thermometer} />
              <PipelineBar label="Cold" count={stats.cold_leads} total={stats.total_leads} color="#0ea5e9" icon={Snowflake} />
              <div style={{ height: 1, background: 'var(--border-faint)', margin: '16px 0' }} />
              <PipelineBar label="Contacted"  count={stats.contacted}  total={stats.total_leads} color="#6366f1" icon={Phone} />
              <PipelineBar label="Qualified"  count={stats.qualified}  total={stats.total_leads} color="#16a34a" icon={CheckCircle} />
            </div>
          </div>

          {/* Maya agent status card */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={18} color="#fff" fill="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Maya AI Agent</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, background: '#16a34a', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 6px #16a34a' }} />
                  Online & Ready
                </div>
              </div>
            </div>
            {[
              { label: 'Calls Today',  value: stats.calls_today },
              { label: 'Total Calls',  value: stats.total_calls },
              { label: 'Conversion',   value: `${stats.conversion_rate}%` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-faint)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
