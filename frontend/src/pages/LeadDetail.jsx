import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, Globe, Hash, MapPin, Home,
  Wallet, Calendar, PhoneCall, Pencil, Trash2, FileText,
} from 'lucide-react'
import { apiFetch } from '../App.jsx'

function InfoRow({ icon, label, value, mono }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-faint)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>{icon} {label}</div>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '2px 16px' }}>{children}</div>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [calling, setCalling] = useState(false)
  const [callMsg, setCallMsg] = useState('')
  const [dealerIntel, setDealerIntel] = useState(null)

  useEffect(() => {
    apiFetch(`/api/leads/${id}`).then(setLead).catch(() => navigate('/leads'))
  }, [id])

  useEffect(() => {
    if (!lead) return
    const city  = lead.preferences?.location
    const model = lead.preferences?.vehicle_model
    if (!city) return
    const params = new URLSearchParams({ city })
    if (model) params.append('model', model)
    apiFetch(`/api/dealer-intelligence?${params}`)
      .then(data => setDealerIntel(data?.intelligence || null))
      .catch(() => {})
  }, [lead])

  const callNow = async () => {
    setCalling(true); setCallMsg('')
    try {
      await apiFetch(`/api/leads/${id}/call`, { method: 'POST' })
      setCallMsg('Call initiated! Maya will connect shortly.')
    } catch (e) { setCallMsg(`Call failed: ${e.message}`) }
    setCalling(false)
  }

  const deleteLead = async () => {
    if (!confirm('Delete this lead?')) return
    await apiFetch(`/api/leads/${id}`, { method: 'DELETE' }).catch(() => {})
    navigate('/leads')
  }

  if (!lead) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text-muted)' }}>
      Loading…
    </div>
  )

  const initials = lead.name ? lead.name[0] + (lead.name.split(' ')[1]?.[0] || '') : '?'
  const langCfg = {
    english:  { label: '🌐 English',  color: '#6366f1' },
    hindi:    { label: '🇮🇳 Hindi',    color: '#f97316' },
    hinglish: { label: '🔀 Hinglish', color: '#10b981' },
  }[lead.preferred_language] || null

  return (
    <div className="animate-fadeInUp" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button className="log-detail-back" onClick={() => navigate('/leads')}>
          <ArrowLeft size={15} /> All Leads
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate(`/leads/${id}/edit`)}>
            <Pencil size={13} /> Update
          </button>
          <button className="topbar-btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate(`/call-logs?lead=${id}`)}>
            <FileText size={13} /> Call Logs
          </button>
          <button className="topbar-btn" style={{ fontSize: 13, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444' }}
            onClick={deleteLead}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Hero header */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div className="lead-avatar" style={{ width: 56, height: 56, fontSize: 20, flexShrink: 0 }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>{lead.name}</h1>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
              <span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span>
              {langCfg && <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: langCfg.color, background: 'rgba(0,0,0,0.04)' }}>{langCfg.label}</span>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Calls Made',    value: lead.call_history?.length ?? 0 },
            { label: 'Engagability',  value: lead.ai_analysis?.engagability || lead.engagability || '—' },
            { label: 'Category',      value: lead.ai_analysis?.category     || lead.tag          || '—' },
            { label: 'Intent',        value: lead.ai_analysis?.purchase_intent || lead.intent    || '—' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-faint)', borderRadius: 10, padding: '8px 14px', minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Call action */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="topbar-btn btn-call" style={{ flex: 1, justifyContent: 'center', padding: '11px' }} onClick={callNow} disabled={calling}>
          <PhoneCall size={14} /> {calling ? 'Calling…' : 'Call Now with Maya'}
        </button>
        <button className="topbar-btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '11px' }} onClick={() => navigate(`/leads/${id}/edit`)}>
          <Pencil size={14} /> Update Lead
        </button>
      </div>

      {callMsg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: callMsg.includes('fail') ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)',
          color: callMsg.includes('fail') ? '#ef4444' : '#16a34a',
          border: `1px solid ${callMsg.includes('fail') ? 'rgba(239,68,68,0.2)' : 'rgba(22,163,74,0.2)'}`,
        }}>{callMsg}</div>
      )}

      {/* Contact info */}
      <Section label="Contact Information">
        <InfoRow icon={<Phone size={13} color="var(--brand-primary)" />}     label="Phone"   value={lead.phone} />
        <InfoRow icon={<Mail size={13} color="var(--brand-primary)" />}      label="Email"   value={lead.email} />
        <InfoRow icon={<Globe size={13} color="var(--brand-primary)" />}     label="Source"  value={lead.source} />
        <InfoRow icon={<Hash size={13} color="var(--brand-primary)" />}      label="Lead ID" value={lead.lead_id} mono />
        <InfoRow icon={<MapPin size={13} color="var(--brand-primary)" />}    label="Address" value={lead.address} />
        {lead.created_at && (
          <InfoRow icon={<Calendar size={13} color="var(--brand-primary)" />} label="Added"
            value={new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
        )}
      </Section>

      {/* Vehicle preferences */}
      {lead.preferences && (
        <Section label="Vehicle Preferences">
          <InfoRow icon={<MapPin size={13} color="#16a34a" />} label="Location"  value={lead.preferences.location} />
          <InfoRow icon={<Home size={13} color="#16a34a" />}   label="Vehicle"   value={`${lead.preferences.vehicle_model || ''}${lead.preferences.variant ? ' ' + lead.preferences.variant : ''}`} />
          <InfoRow icon={<Wallet size={13} color="#16a34a" />} label="Budget"    value={lead.preferences.budget} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>⚙️</span>} label="Transmission" value={lead.preferences.transmission} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>⛽</span>} label="Fuel"         value={lead.preferences.fuel_type} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>💳</span>} label="Finance"      value={lead.preferences.finance} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>🚗</span>} label="Test Drive"   value={lead.preferences.test_drive} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>📝</span>} label="Notes"        value={lead.preferences.notes} />
        </Section>
      )}

      {/* ── Dealership Intelligence Layer ───────────────────────────── */}
      {dealerIntel && (
        <>
          {/* Nearest Dealership */}
          <div className="di-section">
            <div className="di-section-title">🏢 Nearest Dealership — {dealerIntel.city_served}</div>
            <div className="di-dealer-card">
              <div className="di-dealer-header">
                <div className="di-dealer-icon">🏬</div>
                <div>
                  <div className="di-dealer-name">Local Škoda Showroom</div>
                  <div className="di-dealer-area">{dealerIntel.city_served}</div>
                </div>
              </div>
              <div className="di-ai-context">{dealerIntel.dealer_info}</div>
            </div>
          </div>

          {/* Inventory & Offers */}
          {(dealerIntel.inventory_status || dealerIntel.current_offers) && (
            <div className="di-section">
              <div className="di-section-title">📦 Inventory & Offers</div>
              {dealerIntel.inventory_status && (
                <div className="di-ai-context" style={{ marginBottom: 8 }}>
                  {dealerIntel.inventory_status}
                </div>
              )}
              {dealerIntel.current_offers && (
                <div className="di-offers-banner">
                  <span className="di-offers-icon">🎁</span>
                  <div className="di-offers-text">
                    <strong>Current Offers</strong>
                    {dealerIntel.current_offers}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appointment CTA */}
          {dealerIntel.appointment_prompt && (
            <div className="di-section">
              <div className="di-section-title">📅 Recommended Action</div>
              <div className="di-appointment-cta" onClick={() => navigate(`/leads/${id}/edit`)}>
                <div className="di-appointment-cta-text">
                  <div className="di-appointment-cta-title">Schedule Test Drive</div>
                  <div className="di-appointment-cta-sub">{dealerIntel.appointment_prompt}</div>
                </div>
                <span className="di-appointment-cta-arrow">→</span>
              </div>
            </div>
          )}
        </>
      )}
      {(lead.engagability || lead.next_action || lead.follow_up_date) && (
        <Section label="CRM Details">
          <InfoRow icon={<span style={{ fontSize: 11 }}>📊</span>} label="Engagability"  value={lead.engagability} />
          <InfoRow icon={<span style={{ fontSize: 11 }}>📋</span>} label="Next Action"   value={lead.next_action} />
          <InfoRow icon={<Calendar size={13} color="#6366f1" />}   label="Follow-up"     value={lead.follow_up_date} />
        </Section>
      )}

      {/* Buddhi AI Analysis */}
      {lead.ai_analysis && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Buddhi AI Analysis
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 16px 12px' }}>

            {/* Top metric badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {lead.ai_analysis.category && (() => {
                const cfg = {
                  Hot:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#ef4444', icon: '🔥' },
                  Warm: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b', icon: '🌡' },
                  Cold: { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)', color: '#0ea5e9', icon: '❄' },
                }[lead.ai_analysis.category] || { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)', color: 'var(--text-muted)', icon: '' }
                return (
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Category</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.icon} {lead.ai_analysis.category}</div>
                  </div>
                )
              })()}
              {lead.ai_analysis.engagability && (() => {
                const cfg = {
                  'Very High': { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
                  'High':      { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)' },
                  'Medium':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
                  'Low':       { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.25)' },
                }[lead.ai_analysis.engagability] || { color: 'var(--text-muted)', bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)' }
                return (
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Engagability</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>📊 {lead.ai_analysis.engagability}</div>
                  </div>
                )
              })()}
              {lead.ai_analysis.purchase_intent && (
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Purchase Intent</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>🎯 {lead.ai_analysis.purchase_intent}</div>
                </div>
              )}
              {lead.ai_analysis.worth_pursuing !== undefined && (
                <div style={{
                  background: lead.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.07)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${lead.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.22)' : 'rgba(239,68,68,0.2)'}`,
                  borderRadius: 8, padding: '6px 12px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Worth Pursuing</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: lead.ai_analysis.worth_pursuing ? '#16a34a' : '#ef4444' }}>
                    {lead.ai_analysis.worth_pursuing ? '✓ Yes' : '✗ No'}
                  </div>
                </div>
              )}
            </div>

            {/* Conclusion */}
            {lead.ai_analysis.conclusion && (
              <div style={{ marginBottom: 10, padding: '9px 12px', background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conclusion  </span>
                {lead.ai_analysis.conclusion}
              </div>
            )}

            {/* Key Insights */}
            {lead.ai_analysis.key_insights?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Key Insights</div>
                {lead.ai_analysis.key_insights.map((insight, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--brand-primary)', fontWeight: 700, flexShrink: 0 }}>→</span>
                    {insight}
                  </div>
                ))}
              </div>
            )}

            {/* Next Action */}
            {lead.ai_analysis.next_action && (
              <div style={{ padding: '9px 12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: '#10b981', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Action  </span>
                {lead.ai_analysis.next_action}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Call history */}
      {lead.call_history?.length > 0 && (
        <Section label={`Call History (${lead.call_history.length})`}>
          {lead.call_history.slice(0, 6).map((c, i) => (
            <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-faint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {c.timestamp ? new Date(c.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `Call ${i + 1}`}
                {c.duration ? ` · ${c.duration}` : ''}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.outcome || c.status || '—'}</span>
            </div>
          ))}
          {lead.call_history.length > 0 && (
            <div style={{ padding: '10px 0' }}>
              <button className="topbar-btn btn-ghost" style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
                onClick={() => navigate(`/call-logs?lead=${id}`)}>
                <FileText size={12} /> View All in Call Logs
              </button>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
