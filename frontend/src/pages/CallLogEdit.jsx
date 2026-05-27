import React, { useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'

export default function CallLogEdit() {
  const navigate = useNavigate()
  const location = useLocation()
  const { call_id } = useParams()

  const log = location.state?.log || {}

  const [outcome,   setOutcome]   = useState(log.outcome   || '')
  const [status,    setStatus]    = useState(log.status    || 'Completed')
  const [escalated, setEscalated] = useState(log.escalated || false)
  const [saved, setSaved] = useState(false)

  const save = () => {
    // In-memory only (no backend endpoint for call log edits yet)
    setSaved(true)
    setTimeout(() => navigate('/call-logs'), 700)
  }

  return (
    <div className="animate-fadeInUp" style={{ maxWidth: 540, margin: '0 auto' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button className="log-detail-back" onClick={() => navigate('/call-logs')}>
          <ArrowLeft size={15} /> Call History
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-btn btn-ghost" onClick={() => navigate('/call-logs')}>
            <X size={14} /> Cancel
          </button>
          <button className="topbar-btn btn-primary" style={{ minWidth: 130, justifyContent: 'center' }}
            onClick={save} disabled={saved}>
            <Check size={14} /> {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Modifying Call Record</div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--brand-primary)', fontWeight: 700, marginBottom: 4 }}>{log.call_id || call_id}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{log.recipient}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{log.phone} · {log.duration}</div>
      </div>

      {/* Form */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Status</div>
          <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="Completed">Completed</option>
            <option value="Escalated">Escalated</option>
            <option value="No Answer">No Answer</option>
            <option value="Voicemail">Voicemail</option>
            <option value="Callback Requested">Callback Requested</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Outcome / Notes</div>
          <textarea className="form-input" rows={4} style={{ resize: 'vertical', fontSize: 13 }}
            placeholder="Describe what happened in this call..."
            value={outcome} onChange={e => setOutcome(e.target.value)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={escalated} onChange={e => setEscalated(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: '#ef4444', cursor: 'pointer' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Mark as Escalated</span>
        </label>
      </div>

      {/* Bottom action bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="topbar-btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
          onClick={save} disabled={saved}>
          <Check size={14} /> {saved ? 'Saved!' : 'Save Changes'}
        </button>
        <button className="topbar-btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
          onClick={() => navigate('/call-logs')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
