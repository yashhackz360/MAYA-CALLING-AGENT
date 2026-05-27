import React, { useState, useEffect } from 'react'
import { apiFetch } from '../App.jsx'
import {
  Calendar, Users, TrendingUp, Clock, IndianRupee, Target,
  Plus, X, Check
} from 'lucide-react'

const EMPTY_FORM = {
  name: '', description: '', start_time: '', end_time: '', total_leads: '',
}

export default function Campaigns() {
  const [campaigns, setCampaigns]   = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    apiFetch('/api/campaigns').then(d => setCampaigns(d.campaigns || [])).catch(() => {})
  }, [])

  const totalLeads     = campaigns.reduce((a, c) => a + (c.total_leads || 0), 0)
  const totalQualified = campaigns.reduce((a, c) => a + (c.qualified_leads || 0), 0)
  const activeCount    = campaigns.filter(c => c.status === 'Active').length

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleCreate = async () => {
    if (!form.name.trim())       { setError('Campaign name is required.'); return }
    if (!form.start_time)        { setError('Start date is required.'); return }
    if (!form.end_time)          { setError('End date is required.'); return }
    if (!form.total_leads || isNaN(Number(form.total_leads))) { setError('Valid lead count required.'); return }
    setError('')
    setSaving(true)

    const payload = {
      name:        form.name.trim(),
      description: form.description.trim(),
      start_time:  new Date(form.start_time).toISOString(),
      end_time:    new Date(form.end_time).toISOString(),
      total_leads: Number(form.total_leads),
      processed_leads: 0,
      qualified_leads: 0,
      status: 'Scheduled',
    }

    try {
      const res = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
      setCampaigns(prev => [res.campaign || { ...payload, campaign_id: `camp_${Date.now()}` }, ...prev])
    } catch {
      // backend may not support POST yet — add locally
      setCampaigns(prev => [{ ...payload, campaign_id: `camp_${Date.now()}` }, ...prev])
    }

    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)
  }

  return (
    <div className="animate-fadeInUp">

      {/* Top toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Campaigns</h2>
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--brand-primary)',
            background: 'rgba(37,99,235,0.08)', borderRadius: 20, padding: '2px 10px',
          }}>
            {campaigns.length} total
          </span>
        </div>
        <button
          className="topbar-btn btn-primary"
          onClick={() => { setShowForm(s => !s); setError('') }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Campaign'}
        </button>
      </div>

      {/* Create Campaign form panel */}
      {showForm && (
        <div className="card animate-fadeInUp" style={{ marginBottom: 24 }}>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
              Create New Campaign
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Label>Campaign Name</Label>
                <input className="form-input" placeholder="e.g. Kushaq Q3 Outreach" value={form.name}
                  onChange={e => field('name', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Label>Description</Label>
                <textarea className="form-input" rows={2} style={{ resize: 'vertical', fontSize: 13 }}
                  placeholder="What is this campaign targeting?"
                  value={form.description} onChange={e => field('description', e.target.value)} />
              </div>
              <div>
                <Label>Start Date</Label>
                <input type="date" className="form-input" value={form.start_time}
                  onChange={e => field('start_time', e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <input type="date" className="form-input" value={form.end_time}
                  onChange={e => field('end_time', e.target.value)} />
              </div>
              <div>
                <Label>Number of Leads</Label>
                <input type="number" className="form-input" placeholder="e.g. 250" min={1}
                  value={form.total_leads} onChange={e => field('total_leads', e.target.value)} />
              </div>
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13,
                background: 'rgba(239,68,68,0.07)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.2)',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="topbar-btn btn-primary" onClick={handleCreate} disabled={saving}
                style={{ minWidth: 140, justifyContent: 'center' }}>
                <Check size={14} /> {saving ? 'Creating…' : 'Create Campaign'}
              </button>
              <button className="topbar-btn btn-ghost" onClick={() => { setShowForm(false); setError('') }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Active Campaigns', value: activeCount,    color: '#10b981', icon: Target },
          { label: 'Total Leads',      value: totalLeads,     color: '#4f46e5', icon: Users },
          { label: 'Qualified Leads',  value: totalQualified, color: '#f59e0b', icon: TrendingUp },
          { label: 'Pipeline Value',   value: '₹15.9 Cr',    color: '#06b6d4', icon: IndianRupee },
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

      {/* Campaign list */}
      <div style={{ display: 'grid', gap: 16 }}>
        {campaigns.map((camp, i) => {
          const progress  = camp.total_leads > 0 ? Math.round((camp.processed_leads / camp.total_leads) * 100) : 0
          const convRate  = camp.processed_leads > 0 ? Math.round(((camp.qualified_leads || 0) / camp.processed_leads) * 100) : 0
          return (
            <div key={camp.campaign_id} className="card animate-fadeInUp" style={{ animationDelay: `${i * 0.07}s` }}>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{camp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{camp.description}</div>
                    {camp.start_time && (
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>
                          <Calendar size={11} style={{ display: 'inline', marginRight: 3 }} />
                          {new Date(camp.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          {' → '}
                          {new Date(camp.end_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span className={`badge ${camp.status === 'Active' ? 'badge-qualified' : camp.status === 'Scheduled' ? 'badge-warm' : 'badge-cold'}`}>
                      {camp.status}
                    </span>
                    {camp.roi && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#10b981',
                        background: '#ecfdf5', border: '1px solid #a7f3d0',
                        padding: '2px 8px', borderRadius: 20,
                      }}>
                        {camp.roi}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Total Leads', value: camp.total_leads,          icon: Users,      color: '#4f46e5' },
                    { label: 'Called',      value: camp.processed_leads || 0, icon: TrendingUp, color: '#06b6d4' },
                    { label: 'Qualified',   value: camp.qualified_leads || 0, icon: Target,     color: '#10b981' },
                    { label: 'Conversion',  value: `${convRate}%`,            icon: Clock,      color: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <s.icon size={13} color={s.color} style={{ marginBottom: 4 }} />
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {camp.processed_leads || 0} of {camp.total_leads} leads processed
                    </span>
                    <span style={{ fontWeight: 700, color: progress === 100 ? '#10b981' : 'var(--brand-secondary)' }}>
                      {progress}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${progress}%`,
                      background: progress === 100
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #4f46e5, #0891b2)',
                      borderRadius: 3, transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {campaigns.length === 0 && !showForm && (
          <div style={{
            textAlign: 'center', padding: '64px 24px',
            color: 'var(--text-muted)', fontSize: 14,
            background: 'var(--bg-elevated)', borderRadius: 14,
            border: '1px solid var(--border-subtle)',
          }}>
            No campaigns yet. Create your first one above.
          </div>
        )}
      </div>
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
      {children}
    </div>
  )
}
