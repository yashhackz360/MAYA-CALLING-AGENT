import React, { useState, useEffect, useRef } from 'react'
import { Zap, ExternalLink, Bell, Users, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { apiFetch, API_BASE } from '../App.jsx'

export default function LeadGeneration() {
  const [recentLeads, setRecentLeads] = useState([])
  const [stats, setStats] = useState({ total: 0, today: 0, hot: 0 })
  const [notifications, setNotifications] = useState([])
  const wsRef = useRef(null)

  // Load existing leads
  useEffect(() => {
    apiFetch('/api/leads').then(d => {
      const leads = d.leads || []
      setRecentLeads(leads.slice(-10).reverse())
      const today = new Date().toISOString().slice(0, 10)
      setStats({
        total: leads.length,
        today: leads.filter(l => l.created_at?.slice(0, 10) === today).length,
        hot: leads.filter(l => l.tag === 'Hot').length
      })
    }).catch(() => {})
  }, [])

  // Connect to CRM WebSocket for real-time notifications
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/crm'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'new_lead') {
        // Add to recent leads
        setRecentLeads(prev => [data.lead, ...prev].slice(0, 10))
        // Update stats
        setStats(prev => ({
          total: prev.total + 1,
          today: prev.today + 1,
          hot: data.lead.tag === 'Hot' ? prev.hot + 1 : prev.hot
        }))
        // Show notification
        setNotifications(prev => [{
          id: Date.now(),
          message: data.message,
          lead: data.lead,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 5))
      }
    }

    // Keep alive
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => {
      clearInterval(interval)
      ws.close()
    }
  }, [])

  const enquiryUrl = window.location.origin + '/enquiry'

  return (
    <div className="animate-fadeInUp">
      {/* Real-time Notifications */}
      {notifications.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {notifications.map(n => (
            <div key={n.id} className="lead-notification animate-fadeInUp" style={{ marginBottom: 8 }}>
              <Bell size={16} color="#10b981" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>🔔 {n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {n.lead?.phone} · {n.lead?.preferences?.vehicle_model || 'Vehicle'} · {n.timestamp}
                </div>
              </div>
              <span className="badge badge-hot">NEW</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Row */}
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <Users size={24} color="var(--brand-primary)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.total}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Total Leads</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <Clock size={24} color="#f59e0b" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{stats.today}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Today</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <TrendingUp size={24} color="#ef4444" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444' }}>{stats.hot}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Hot Leads</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <Zap size={24} color="#10b981" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>Live</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Realtime Sync</div>
          </div>
        </div>
      </div>

      {/* Enquiry Form Link */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">📋 Public Enquiry Form</span>
          <a
            href="/enquiry"
            target="_blank"
            className="topbar-btn btn-primary"
            style={{ fontSize: 12, textDecoration: 'none' }}
          >
            <ExternalLink size={12} /> Open Form
          </a>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Share this link with Škoda enquiry channels. Submissions appear here instantly via WebSocket.
          </p>
          <div style={{
            padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
            fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-primary)',
            border: '1px solid var(--border-subtle)', wordBreak: 'break-all',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>{enquiryUrl}</span>
            <button
              className="topbar-btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
              onClick={() => { navigator.clipboard.writeText(enquiryUrl) }}
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      {/* Recent Submissions */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📥 Recent Enquiry Submissions</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Last 10</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {recentLeads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No enquiries yet. Share the form link to start receiving leads.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentLeads.map((lead, i) => (
                <div
                  key={lead.lead_id}
                  className="lead-row-card"
                  style={{
                    padding: '12px 20px',
                    borderBottom: i < recentLeads.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    borderRadius: 0,
                    animation: i === 0 && notifications.length > 0 ? 'fadeInUp 0.3s ease' : 'none'
                  }}
                >
                  <div className="lead-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
                    {lead.name?.[0]}{lead.name?.split(' ')[1]?.[0] || ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {lead.name}
                      {lead.company_name && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                          @ {lead.company_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>📱 {lead.phone}</span>
                      <span>📧 {lead.email}</span>
                      {lead.preferences?.location && <span>📍 {lead.preferences.location}</span>}
                      {lead.preferences?.vehicle_model && <span>🚗 {lead.preferences.vehicle_model}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {lead.source || 'Website'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
