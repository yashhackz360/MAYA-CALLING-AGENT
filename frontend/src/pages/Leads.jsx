import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneCall, MapPin, Home, Wallet, Filter, Search, Plus } from 'lucide-react'
import { apiFetch } from '../App.jsx'

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', source: 'Website', preferences: {} })
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})
  }, [])

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.email?.includes(q)
    const matchTag = !filterTag || l.tag === filterTag
    const matchStatus = !filterStatus || l.status === filterStatus
    return matchSearch && matchTag && matchStatus
  })

  const handleAddLead = async () => {
    try {
      const res = await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify(newLead)
      })
      setLeads(prev => [...prev, res.lead])
      setShowAddForm(false)
      setNewLead({ name: '', phone: '', email: '', source: 'Website', preferences: {} })
    } catch (e) {
      alert('Failed to add lead')
    }
  }

  return (
    <div className="animate-fadeInUp">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            id="lead-search"
            className="form-input"
            placeholder="Search leads..."
            style={{ paddingLeft: 36 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          id="filter-tag"
          className="form-input"
          style={{ width: 130 }}
          value={filterTag}
          onChange={e => setFilterTag(e.target.value)}
        >
          <option value="">All Tags</option>
          <option value="Hot">Hot</option>
          <option value="Warm">Warm</option>
          <option value="Cold">Cold</option>
        </select>
        <select
          id="filter-status"
          className="form-input"
          style={{ width: 150 }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="New">New</option>
          <option value="Contacted">Contacted</option>
          <option value="Qualified">Qualified</option>
        </select>
        <button
          id="add-lead-btn"
          className="topbar-btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={14} /> Add Lead
        </button>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <div className="card animate-fadeInUp" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Add New Lead</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { label: 'Name', key: 'name', placeholder: 'Full Name' },
              { label: 'Phone', key: 'phone', placeholder: '+91 98765 43210' },
              { label: 'Email', key: 'email', placeholder: 'email@example.com' },
              { label: 'Source', key: 'source', placeholder: 'Website / Referral / etc.' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>{f.label}</div>
                <input
                  className="form-input"
                  placeholder={f.placeholder}
                  value={newLead[f.key]}
                  onChange={e => setNewLead(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="topbar-btn btn-primary" onClick={handleAddLead}>Save Lead</button>
            <button className="topbar-btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Summary Counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', count: leads.length, color: 'var(--brand-secondary)' },
          { label: 'Hot', count: leads.filter(l => l.tag === 'Hot').length, color: '#ef4444' },
          { label: 'Warm', count: leads.filter(l => l.tag === 'Warm').length, color: '#f59e0b' },
          { label: 'Cold', count: leads.filter(l => l.tag === 'Cold').length, color: '#3b82f6' },
          { label: 'Filtered', count: filtered.length, color: 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 700, color: s.color, fontSize: 18, marginRight: 4 }}>{s.count}</span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Leads Grid */}
      <div className="leads-grid">
        {filtered.map((lead, i) => (
          <div
            key={lead.lead_id}
            id={`lead-card-${lead.lead_id}`}
            className="lead-row-card animate-fadeInUp"
            style={{ animationDelay: `${i * 0.05}s` }}
            onClick={() => navigate(`/call-console/${lead.lead_id}`)}
          >
            <div className="lead-avatar">
              {lead.name[0]}{lead.name.split(' ')[1]?.[0] || ''}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{lead.name}</span>
                <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
                <span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span>
                {lead.preferred_language && (() => {
                  const cfg = {
                    english:  { label: '🌐 English',  bg: 'rgba(99,102,241,0.13)', border: 'rgba(99,102,241,0.4)',  color: '#a5b4fc' },
                    hindi:    { label: '🇮🇳 Hindi',    bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.4)',  color: '#fb923c' },
                    hinglish: { label: '🔀 Hinglish',  bg: 'rgba(74,222,128,0.13)', border: 'rgba(74,222,128,0.4)',  color: '#4ade80' },
                  }[lead.preferred_language]
                  return cfg ? (
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                    }}>{cfg.label}</span>
                  ) : null
                })()}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>📱 {lead.phone}</span>
                <span><MapPin size={10} style={{ display: 'inline' }} /> {lead.preferences?.location}</span>
                <span><Home size={10} style={{ display: 'inline' }} /> {lead.preferences?.vehicle_model}</span>
                <span><Wallet size={10} style={{ display: 'inline' }} /> {lead.preferences?.budget}</span>
              </div>
            </div>

            <div style={{ text: 'right', flexShrink: 0 }}>
              {lead.call_history?.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textAlign: 'right' }}>
                  {lead.call_history.length} call{lead.call_history.length > 1 ? 's' : ''}
                </div>
              )}
              <button
                id={`call-lead-btn-${lead.lead_id}`}
                className="topbar-btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px' }}
                onClick={e => { e.stopPropagation(); navigate(`/call-console/${lead.lead_id}`) }}
              >
                <PhoneCall size={12} /> Call
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            No leads found
          </div>
        )}
      </div>
    </div>
  )
}
