import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Clock, User, Phone, CheckCircle, AlertTriangle,
  Eye, Trash2, X, Pencil, Check, Download, ArrowLeft, ChevronDown,
} from 'lucide-react'
import { apiFetch, API_BASE } from '../App.jsx'

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows, columns, filename) {
  const header = columns.map(c => `"${c.label}"`).join(',')
  const body   = rows.map(row =>
    columns.map(c => {
      const val = c.key.split('.').reduce((o, k) => o?.[k], row) ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv  = [header, ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const LOG_COLUMNS = [
  { label: 'Call ID',   key: 'call_id' },
  { label: 'Customer',  key: 'recipient' },
  { label: 'Phone',     key: 'phone' },
  { label: 'Duration',  key: 'duration' },
  { label: 'Status',    key: 'status' },
  { label: 'Outcome',   key: 'outcome' },
  { label: 'Date',      key: 'date' },
  { label: 'Escalated', key: 'escalated' },
  { label: 'Lead ID',   key: 'lead_id' },
]

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_LOGS = [
  {
    call_id: 'CALL-DEMO1', lead_id: 'lead_003',
    recipient: 'Ananya Reddy', phone: '+91 76543 21098',
    duration: '3:24', status: 'Completed',
    outcome: 'Interested – test drive booked',
    date: new Date(Date.now() - 72000000).toISOString(), escalated: false,
    transcript: [
      { role: 'agent',    text: 'Hello! This is Maya from Škoda Customer Care. Am I speaking with Ananya?' },
      { role: 'customer', text: 'Yes, this is Ananya.' },
      { role: 'agent',    text: 'Great! I wanted to follow up on your interest in the Škoda Kushaq. Are you still considering a test drive?' },
      { role: 'customer', text: 'Yes, I would love a test drive this weekend if possible.' },
      { role: 'agent',    text: 'Absolutely! Can I confirm your location so I can book the nearest showroom?' },
      { role: 'customer', text: 'Hyderabad, Banjara Hills area.' },
      { role: 'agent',    text: 'Perfect. I have booked a test drive at our Banjara Hills showroom for this Saturday at 11 AM. Thank you, Ananya!' },
    ],
  },
  {
    call_id: 'CALL-DEMO2', lead_id: 'lead_001',
    recipient: 'Rahul Sharma', phone: '+91 98765 43210',
    duration: '1:55', status: 'Completed',
    outcome: 'Requested callback – price negotiation',
    date: new Date(Date.now() - 3600000 * 5).toISOString(), escalated: false,
    transcript: [
      { role: 'agent',    text: 'Hello Rahul, calling from Škoda regarding your enquiry about the Slavia.' },
      { role: 'customer', text: 'Yes, I was interested but found the price a bit high.' },
      { role: 'agent',    text: 'I understand. We have some financing options and year-end offers that might help. Would you like our sales team to call you back?' },
      { role: 'customer', text: 'Yes please, tomorrow afternoon.' },
    ],
  },
  {
    call_id: 'CALL-DEMO3', lead_id: 'lead_002',
    recipient: 'Priya Mehta', phone: '+91 87654 32109',
    duration: '0:45', status: 'Escalated',
    outcome: 'Complaint – transferred to human agent',
    date: new Date(Date.now() - 3600000 * 24).toISOString(), escalated: true,
    transcript: [
      { role: 'agent',    text: 'Hello Priya, this is Maya from Škoda.' },
      { role: 'customer', text: 'I have been waiting for my car service for 3 weeks and nobody is helping me!' },
      { role: 'agent',    text: 'I sincerely apologize for the inconvenience. Let me transfer you to our senior support team immediately.' },
    ],
  },
]

// ── Modify Modal ──────────────────────────────────────────────────────────────

function ModifyLogModal({ log, onClose, onSave }) {
  const [outcome, setOutcome]     = useState(log.outcome || '')
  const [status, setStatus]       = useState(log.status || 'Completed')
  const [escalated, setEscalated] = useState(log.escalated || false)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.48)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-elevated)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 440,
        boxShadow: 'var(--shadow-lg)', animation: 'fadeInUp 0.18s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--brand-primary)', marginBottom: 2 }}>{log.call_id}</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Modify Call Record</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{log.recipient} · {log.phone}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="Completed">Completed</option>
              <option value="Escalated">Escalated</option>
              <option value="No Answer">No Answer</option>
              <option value="Voicemail">Voicemail</option>
              <option value="Callback Requested">Callback Requested</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Outcome / Notes</div>
            <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontSize: 13 }}
              placeholder="Describe what happened in this call..."
              value={outcome} onChange={e => setOutcome(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={escalated} onChange={e => setEscalated(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#ef4444', cursor: 'pointer' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Mark as Escalated</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <button className="topbar-btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '11px' }}
            onClick={() => { onSave(log.call_id, { outcome, status, escalated }); onClose() }}>
            <Check size={14} /> Save Changes
          </button>
          <button className="topbar-btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '11px' }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Call Log Detail View ──────────────────────────────────────────────────────

function CallLogDetail({ log, onBack, onModify, onDelete }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const dateStr = new Date(log.date).toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="animate-fadeInUp">
      {/* Navigation bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <button className="log-detail-back" onClick={onBack}>
          <ArrowLeft size={15} /> Call History
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-btn btn-ghost" style={{ fontSize: 13 }} onClick={() => onModify(log)}>
            <Pencil size={13} /> Modify
          </button>
          <button
            className="topbar-btn"
            style={{ fontSize: 13, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444' }}
            onClick={() => { onDelete(log.call_id); onBack() }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Hero header */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-primary)', fontWeight: 700, marginBottom: 6 }}>
              {log.call_id}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              {log.recipient}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-muted)' }}>
              <Phone size={13} /> {log.phone}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span className={`badge ${log.status === 'Escalated' ? 'badge-hot' : 'badge-qualified'}`}
              style={{ fontSize: 13, padding: '4px 14px' }}>
              {log.status}
            </span>
            {log.escalated && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                <AlertTriangle size={12} /> Escalated
              </span>
            )}
          </div>
        </div>

        {/* Metadata pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Duration',  value: log.duration,   icon: <Clock size={12} /> },
            { label: 'Date',      value: dateStr,        icon: null },
            { label: 'Agent',     value: 'Maya (AI)',    icon: null },
            { label: 'Lead',      value: log.lead_id,    icon: null, mono: true },
          ].map(({ label, value, icon, mono }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-faint)',
              borderRadius: 10, padding: '8px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: mono ? 'monospace' : undefined,
              }}>
                {icon} {value}
              </div>
            </div>
          ))}
        </div>

        {/* Outcome */}
        {log.outcome && (
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: 10, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            {log.outcome}
          </div>
        )}
      </div>

      {/* Recording player */}
      {log.recording_sid && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: 16, padding: '16px 24px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎙</span> Call Recording
          </div>
          <audio
            controls
            style={{ width: '100%', borderRadius: 8, accentColor: 'var(--brand-primary)' }}
          >
            <source src={`${API_BASE}/api/recordings/${log.recording_sid}`} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Buddhi AI Analysis */}
      {log.ai_analysis && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: 16, padding: '16px 24px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Buddhi AI Analysis
          </div>

          {/* Metric badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {/* Category */}
            {log.ai_analysis.category && (() => {
              const cfg = {
                Hot:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#ef4444', icon: '🔥' },
                Warm: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b', icon: '🌡' },
                Cold: { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)', color: '#0ea5e9', icon: '❄' },
              }[log.ai_analysis.category] || { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)', color: 'var(--text-muted)', icon: '' }
              return (
                <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '8px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Lead Category</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.icon} {log.ai_analysis.category}</div>
                </div>
              )
            })()}

            {/* Engagability */}
            {log.ai_analysis.engagability && (() => {
              const cfg = {
                'Very High': { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
                'High':      { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)' },
                'Medium':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
                'Low':       { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.25)' },
              }[log.ai_analysis.engagability] || { color: 'var(--text-muted)', bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.1)' }
              return (
                <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '8px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Engagability</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>📊 {log.ai_analysis.engagability}</div>
                </div>
              )
            })()}

            {/* Purchase Intent */}
            {log.ai_analysis.purchase_intent && (
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '8px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Purchase Intent</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>🎯 {log.ai_analysis.purchase_intent}</div>
              </div>
            )}

            {/* Worth Pursuing */}
            {log.ai_analysis.worth_pursuing !== undefined && (
              <div style={{
                background: log.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.07)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${log.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.22)' : 'rgba(239,68,68,0.2)'}`,
                borderRadius: 10, padding: '8px 14px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Worth Pursuing</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: log.ai_analysis.worth_pursuing ? '#16a34a' : '#ef4444' }}>
                  {log.ai_analysis.worth_pursuing ? '✓ Yes' : '✗ No'}
                </div>
              </div>
            )}
          </div>

          {/* Conclusion */}
          {log.ai_analysis.conclusion && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conclusion </span>
              {log.ai_analysis.conclusion}
            </div>
          )}

          {/* Key Insights */}
          {log.ai_analysis.key_insights?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Key Insights</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {log.ai_analysis.key_insights.map((insight, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--brand-primary)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>→</span>
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Action */}
          {log.ai_analysis.next_action && (
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: '#10b981', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Next Action </span>
              {log.ai_analysis.next_action}
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        <button
          onClick={() => setTranscriptOpen(o => !o)}
          style={{
            width: '100%', padding: '16px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: transcriptOpen ? '1px solid var(--border-faint)' : 'none',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Conversation Transcript
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {log.transcript && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {log.transcript.length} turns
              </span>
            )}
            <ChevronDown
              size={16}
              color="var(--text-muted)"
              style={{ transition: 'transform 0.2s', transform: transcriptOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </div>
        </button>

        {transcriptOpen && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {log.transcript && log.transcript.length > 0 ? (
              log.transcript.map((turn, i) => (
                <div key={i} className={`log-transcript-bubble ${turn.role}`}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: turn.role === 'agent' ? 'var(--brand-primary)' : '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: '#fff', fontWeight: 700,
                  }}>
                    {turn.role === 'agent' ? 'M' : (log.recipient?.[0] || 'C')}
                  </div>
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
                      textAlign: turn.role === 'agent' ? 'left' : 'right',
                    }}>
                      {turn.role === 'agent' ? 'Maya' : log.recipient}
                    </div>
                    <div style={{
                      background: turn.role === 'agent' ? 'rgba(37,99,235,0.06)' : 'rgba(99,102,241,0.07)',
                      border: `1px solid ${turn.role === 'agent' ? 'rgba(37,99,235,0.14)' : 'rgba(99,102,241,0.18)'}`,
                      borderRadius: turn.role === 'agent' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                      padding: '10px 14px', fontSize: 14,
                      color: 'var(--text-primary)', lineHeight: 1.6,
                    }}>
                      {turn.text}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                No transcript available for this call.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── CallLog Card ──────────────────────────────────────────────────────────────

function CallLogCard({ log, onView, onModify, onDelete }) {
  const dateStr = new Date(log.date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="call-log-card" style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
      cursor: 'pointer',
    }}
    onClick={() => onView(log)}
    >
      {/* Row 1: call ID + status badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--brand-primary)', fontWeight: 700 }}>
          {log.call_id}
        </span>
        <span className={`badge ${log.status === 'Escalated' ? 'badge-hot' : 'badge-qualified'}`}>
          {log.status}
        </span>
        {log.escalated && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
            <AlertTriangle size={11} /> Escalated
          </span>
        )}
      </div>

      {/* Row 2: Agent → Customer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Maya</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
        <User size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{log.recipient}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Phone size={11} /> {log.phone}
        </span>
      </div>

      {/* Row 3: Duration + Date */}
      <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} /> {log.duration}
        </span>
        <span>{dateStr}</span>
        {!log.escalated && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#16a34a' }}>
            <CheckCircle size={11} /> No escalation
          </span>
        )}
      </div>

      {/* Row 4: AI analysis badges (if available) */}
      {log.ai_analysis && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {log.ai_analysis.category && (() => {
            const colors = { Hot: '#ef4444', Warm: '#f59e0b', Cold: '#0ea5e9' }
            const icons  = { Hot: '🔥', Warm: '🌡', Cold: '❄' }
            const c = colors[log.ai_analysis.category] || 'var(--text-muted)'
            return (
              <span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}40`, borderRadius: 6, padding: '2px 8px' }}>
                {icons[log.ai_analysis.category]} {log.ai_analysis.category}
              </span>
            )
          })()}
          {log.ai_analysis.engagability && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-faint)', borderRadius: 6, padding: '2px 8px' }}>
              📊 {log.ai_analysis.engagability}
            </span>
          )}
          {log.ai_analysis.worth_pursuing !== undefined && (
            <span style={{ fontSize: 11, fontWeight: 600, color: log.ai_analysis.worth_pursuing ? '#16a34a' : '#ef4444', background: log.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.07)' : 'rgba(239,68,68,0.06)', border: `1px solid ${log.ai_analysis.worth_pursuing ? 'rgba(22,163,74,0.2)' : 'rgba(239,68,68,0.18)'}`, borderRadius: 6, padding: '2px 8px' }}>
              {log.ai_analysis.worth_pursuing ? '✓ Pursue' : '✗ Not Worth'}
            </span>
          )}
          {log.recording_sid && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '2px 8px' }}>
              🎙 Recording
            </span>
          )}
        </div>
      )}

      {/* Row 5: Outcome */}
      {log.outcome && (
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)',
          borderTop: '1px solid var(--border-faint)', paddingTop: 10,
          lineHeight: 1.5,
        }}>
          {log.outcome}
        </div>
      )}

      {/* Row 6: Action buttons */}
      <div
        className="card-actions"
        style={{ justifyContent: 'flex-end', marginTop: 2 }}
        onClick={e => e.stopPropagation()}
      >
        <button className="action-btn view" title="View details" onClick={() => onView(log)}>
          <Eye size={14} />
        </button>
        <button className="action-btn edit" title="Modify record" onClick={() => onModify(log)}>
          <Pencil size={14} />
        </button>
        <button className="action-btn delete" title="Delete log" onClick={() => onDelete(log.call_id)}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── CallLogs Page ─────────────────────────────────────────────────────────────

export default function CallLogs() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const leadFilter = searchParams.get('lead') || ''

  const [logs, setLogs]           = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [modifyLog, setModifyLog] = useState(null)

  const fetchLogs = useCallback(() => {
    apiFetch('/api/calls/logs')
      .then(d => {
        const fetched = d.logs || []
        setLogs(fetched.length > 0 ? fetched : DEMO_LOGS)
      })
      .catch(() => setLogs(DEMO_LOGS))
  }, [])

  useEffect(() => {
    fetchLogs()
    const timer = setInterval(fetchLogs, 30000)
    return () => clearInterval(timer)
  }, [fetchLogs])

  const deleteLog = id => {
    setLogs(l => l.filter(x => x.call_id !== id))
    if (selectedLog?.call_id === id) setSelectedLog(null)
  }

  const saveLog = (call_id, patch) => {
    setLogs(prev => prev.map(l => l.call_id === call_id ? { ...l, ...patch } : l))
    if (selectedLog?.call_id === call_id) setSelectedLog(s => ({ ...s, ...patch }))
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedLog) {
    return (
      <>
        <CallLogDetail
          log={selectedLog}
          onBack={() => setSelectedLog(null)}
          onModify={setModifyLog}
          onDelete={deleteLog}
        />
        {modifyLog && (
          <ModifyLogModal
            log={modifyLog}
            onClose={() => setModifyLog(null)}
            onSave={saveLog}
          />
        )}
      </>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const displayLogs = leadFilter ? logs.filter(l => l.lead_id === leadFilter) : logs

  return (
    <div className="animate-fadeInUp">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {leadFilter && (
            <button className="log-detail-back" onClick={() => navigate(`/leads/${leadFilter}`)}>
              <ArrowLeft size={15} /> Back to Lead
            </button>
          )}
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {leadFilter ? `Calls for ${leadFilter}` : 'Call History'}
          </h2>
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--brand-primary)',
            background: 'rgba(37,99,235,0.08)', borderRadius: 20, padding: '2px 10px',
          }}>
            {displayLogs.length} calls
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-btn btn-ghost" style={{ fontSize: 12, padding: '5px 11px', gap: 5 }}
            onClick={() => exportCSV(logs, LOG_COLUMNS, 'call-logs.csv')}>
            <Download size={13} /> Export
          </button>
          <button className="topbar-btn btn-ghost" style={{ fontSize: 12, padding: '5px 11px' }} onClick={fetchLogs}>
            Refresh
          </button>
        </div>
      </div>

      {displayLogs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 24px',
          color: 'var(--text-muted)', fontSize: 14,
          background: 'var(--bg-elevated)', borderRadius: 14,
          border: '1px solid var(--border-subtle)',
        }}>
          {leadFilter ? 'No calls found for this lead.' : 'No call logs yet. Start a call from the Leads page.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {displayLogs.map((log, i) => (
            <CallLogCard
              key={`${log.call_id}-${i}`}
              log={log}
              onView={setSelectedLog}
              onModify={log => navigate(`/call-logs/${encodeURIComponent(log.call_id)}/edit`, { state: { log } })}
              onDelete={deleteLog}
            />
          ))}
        </div>
      )}

      {modifyLog && (
        <ModifyLogModal
          log={modifyLog}
          onClose={() => setModifyLog(null)}
          onSave={saveLog}
        />
      )}
    </div>
  )
}
