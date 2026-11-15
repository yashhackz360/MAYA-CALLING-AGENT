import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, Globe, Hash, MapPin, Home,
  Wallet, Calendar, PhoneCall, Pencil, Trash2, FileText, ChevronDown, Download,
} from 'lucide-react'
import { apiFetch, API_BASE } from '../App.jsx'

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
  const [transcriptOpen, setTranscriptOpen] = useState(true)

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

  const latestCall   = lead.call_history?.[lead.call_history.length - 1]
  const recordingUrl = lead.recording_url || latestCall?.recording_url || (
    (lead.recording_sid || latestCall?.recording_sid)
      ? `${API_BASE}/api/recordings/${lead.recording_sid || latestCall?.recording_sid}`
      : null
  )
  const transcript   = lead.transcript || latestCall?.transcript || []
  const aiAnalysis   = lead.ai_analysis || latestCall?.ai_analysis || null

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

      {/* Client Reference Demo Banner */}
      {lead.is_demo_reference && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(16,185,129,0.08))',
          border: '1px solid rgba(37,99,235,0.25)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎙</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Client Reference Demo Lead
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Includes live AI call voice recording, 25-turn bilingual transcription, and Buddhi AI lead classification
              </div>
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#10b981',
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)',
            borderRadius: 999, padding: '3px 10px',
          }}>
            ✓ Verified Live Call
          </span>
        </div>
      )}

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
              {recordingUrl && (
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)' }}>
                  🎙 Voice Recording
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Calls Made',    value: lead.call_history?.length ?? 0 },
            { label: 'Engagability',  value: aiAnalysis?.engagability || lead.engagability || '—' },
            { label: 'Category',      value: aiAnalysis?.category     || lead.tag          || '—' },
            { label: 'Intent',        value: aiAnalysis?.purchase_intent || lead.intent    || '—' },
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

      {/* ── Call Recording Player ─────────────────────────────────────────── */}
      {recordingUrl && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Voice Recording
          </div>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🎙</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Maya AI Outbound Qualification Call
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Duration: {latestCall?.duration || '4:15'} · ElevenLabs Tara Voice × Twilio PSTN · English → Hindi Switch
                  </div>
                </div>
              </div>
              <a
                href={recordingUrl}
                download="maya-demo-call.mp3"
                className="topbar-btn btn-ghost"
                style={{ fontSize: 12, padding: '5px 10px', textDecoration: 'none', gap: 5 }}
              >
                <Download size={12} /> Download MP3
              </a>
            </div>
            <audio
              controls
              style={{ width: '100%', borderRadius: 8, accentColor: 'var(--brand-primary)' }}
            >
              <source src={recordingUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      )}

      {/* ── Lead Classification (Buddhi AI Analysis) ──────────────────────── */}
      {aiAnalysis && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Lead Classification · Buddhi AI Analysis
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 16px 12px' }}>

            {/* Top metric badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {aiAnalysis.category && (() => {
                const cfg = {
                  Hot:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#ef4444', icon: '🔥' },
                  Warm: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b', icon: '🌡' },
                  Cold: { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)', color: '#0ea5e9', icon: '❄' },
                }[aiAnalysis.category] || { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)', color: 'var(--text-muted)', icon: '' }
                return (
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Lead Classification</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.icon} {aiAnalysis.category}</div>
                  </div>
                )
              })()}
              {aiAnalysis.engagability && (() => {
                const cfg = {
                  'Very High': { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
                  'High':      { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)' },
                  'Medium':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
                  'Low':       { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.25)' },
                }[aiAnalysis.engagability] || { color: 'var(--text-muted)', bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)' }
                return (
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Engagability</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>📊 {aiAnalysis.engagability}</div>
                  </div>
                )
              })()}
              {aiAnalysis.purchase_intent && (
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Purchase Intent</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>🎯 {aiAnalysis.purchase_intent}</div>
                </div>
              )}
              {aiAnalysis.worth_pursuing !== undefined && (
                <div style={{
                  background: aiAnalysis.worth_pursuing ? 'rgba(22,163,74,0.07)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${aiAnalysis.worth_pursuing ? 'rgba(22,163,74,0.22)' : 'rgba(239,68,68,0.2)'}`,
                  borderRadius: 8, padding: '6px 12px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Worth Pursuing</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: aiAnalysis.worth_pursuing ? '#16a34a' : '#ef4444' }}>
                    {aiAnalysis.worth_pursuing ? '✓ Yes' : '✗ No'}
                  </div>
                </div>
              )}
            </div>

            {/* Conclusion */}
            {aiAnalysis.conclusion && (
              <div style={{ marginBottom: 10, padding: '9px 12px', background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conclusion  </span>
                {aiAnalysis.conclusion}
              </div>
            )}

            {/* Key Insights */}
            {aiAnalysis.key_insights?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Key Insights</div>
                {aiAnalysis.key_insights.map((insight, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--brand-primary)', fontWeight: 700, flexShrink: 0 }}>→</span>
                    {insight}
                  </div>
                ))}
              </div>
            )}

            {/* Next Action */}
            {aiAnalysis.next_action && (
              <div style={{ padding: '9px 12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: '#10b981', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Action  </span>
                {aiAnalysis.next_action}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Conversation Transcript ───────────────────────────────────────── */}
      {transcript.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Call Transcription
          </div>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <button
              onClick={() => setTranscriptOpen(o => !o)}
              style={{
                width: '100%', padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: transcriptOpen ? '1px solid var(--border-faint)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Conversation Transcript (Maya AI × {lead.name})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {transcript.length} turns
                </span>
                <ChevronDown
                  size={16}
                  color="var(--text-muted)"
                  style={{ transition: 'transform 0.2s', transform: transcriptOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </div>
            </button>

            {transcriptOpen && (
              <div style={{ padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflowY: 'auto' }}>
                {transcript.map((turn, i) => (
                  <div key={i} className={`log-transcript-bubble ${turn.role}`}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: turn.role === 'agent' ? 'var(--brand-primary)' : '#6366f1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: '#fff', fontWeight: 700,
                    }}>
                      {turn.role === 'agent' ? 'M' : (lead.name?.[0] || 'C')}
                    </div>
                    <div style={{ maxWidth: '75%' }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
                        textAlign: turn.role === 'agent' ? 'left' : 'right',
                      }}>
                        {turn.role === 'agent' ? 'Maya (AI)' : lead.name}
                      </div>
                      <div style={{
                        background: turn.role === 'agent' ? 'rgba(37,99,235,0.06)' : 'rgba(99,102,241,0.07)',
                        border: `1px solid ${turn.role === 'agent' ? 'rgba(37,99,235,0.14)' : 'rgba(99,102,241,0.18)'}`,
                        borderRadius: turn.role === 'agent' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                        padding: '9px 13px', fontSize: 13,
                        color: 'var(--text-primary)', lineHeight: 1.55,
                      }}>
                        {turn.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
