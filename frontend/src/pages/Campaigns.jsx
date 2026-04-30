import React, { useState, useEffect } from 'react'
import { apiFetch } from '../App.jsx'
import { Calendar, Users, TrendingUp, Clock, IndianRupee, Target } from 'lucide-react'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    apiFetch('/api/campaigns').then(d => setCampaigns(d.campaigns || [])).catch(() => {})
  }, [])

  const totalLeads = campaigns.reduce((a, c) => a + c.total_leads, 0)
  const totalQualified = campaigns.reduce((a, c) => a + (c.qualified_leads || 0), 0)
  const activeCount = campaigns.filter(c => c.status === 'Active').length

  return (
    <div className="animate-fadeInUp">
      {/* Summary row */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Active Campaigns', value: activeCount, color: '#10b981', icon: Target },
          { label: 'Total Leads', value: totalLeads, color: '#4f46e5', icon: Users },
          { label: 'Qualified Leads', value: totalQualified, color: '#f59e0b', icon: TrendingUp },
          { label: 'Pipeline Value', value: '₹15.9 Cr', color: '#06b6d4', icon: IndianRupee },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': `linear-gradient(90deg, ${s.color}, ${s.color}88)` }}>
            <div className="stat-icon" style={{ background: `${s.color}18` }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Campaign Cards */}
      <div style={{ display: 'grid', gap: 16 }}>
        {campaigns.map((camp, i) => {
          const progress = Math.round((camp.processed_leads / camp.total_leads) * 100)
          const convRate = camp.processed_leads > 0 ? Math.round((camp.qualified_leads / camp.processed_leads) * 100) : 0
          return (
            <div key={camp.campaign_id} className="card animate-fadeInUp" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{camp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{camp.description}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span><Calendar size={11} style={{ display: 'inline', marginRight: 3 }} />
                        {new Date(camp.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {' → '}
                        {new Date(camp.end_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span className={`badge ${camp.status === 'Active' ? 'badge-qualified' : 'badge-cold'}`}>
                      {camp.status}
                    </span>
                    {camp.roi && (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: '#10b981',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        padding: '2px 8px', borderRadius: 20
                      }}>
                        💰 {camp.roi}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Total Leads', value: camp.total_leads, icon: Users, color: '#4f46e5' },
                    { label: 'Called', value: camp.processed_leads, icon: TrendingUp, color: '#06b6d4' },
                    { label: 'Qualified', value: camp.qualified_leads || 0, icon: Target, color: '#10b981' },
                    { label: 'Conversion', value: `${convRate}%`, icon: Clock, color: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <s.icon size={13} color={s.color} style={{ marginBottom: 4 }} />
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {camp.processed_leads} of {camp.total_leads} leads processed
                    </span>
                    <span style={{ fontWeight: 700, color: progress === 100 ? '#10b981' : 'var(--brand-secondary)' }}>
                      {progress}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: progress === 100
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #4f46e5, #0891b2)',
                      borderRadius: 3,
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {campaigns.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            Loading campaigns...
          </div>
        )}
      </div>
    </div>
  )
}
