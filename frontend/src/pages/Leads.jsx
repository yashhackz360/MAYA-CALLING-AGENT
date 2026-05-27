import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Phone, PhoneCall, MapPin, Home, Wallet, Search, Plus,
  Eye, Pencil, Trash2, FileText, Download, Upload, X, Check, AlertCircle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { apiFetch } from '../App.jsx'

// ── CSV export helper ─────────────────────────────────────────────────────────

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
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const LEAD_COLUMNS = [
  { label: 'Lead ID',       key: 'lead_id' },
  { label: 'Name',          key: 'name' },
  { label: 'Phone',         key: 'phone' },
  { label: 'Email',         key: 'email' },
  { label: 'Source',        key: 'source' },
  { label: 'Tag',           key: 'tag' },
  { label: 'Status',        key: 'status' },
  { label: 'Language',      key: 'preferred_language' },
  { label: 'Location',      key: 'preferences.location' },
  { label: 'Vehicle',       key: 'preferences.vehicle_model' },
  { label: 'Budget',        key: 'preferences.budget' },
  { label: 'Engagability',  key: 'engagability' },
  { label: 'Address',       key: 'address' },
  { label: 'Next Action',   key: 'next_action' },
  { label: 'Follow-up',     key: 'follow_up_date' },
  { label: 'Created',       key: 'created_at' },
]

// ── Helper sub-components ─────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '2px 14px' }}>
        {children}
      </div>
    </div>
  )
}

function _LeadModal_placeholder() {
  const [editing, setEditing] = useState(initialEditing)
  const [calling, setCalling] = useState(false)
  const [callMsg, setCallMsg] = useState('')

  const [form, setForm] = useState({
    tag:            lead.tag            || 'Warm',
    status:         lead.status         || 'New',
    engagability:   lead.engagability   || '',
    address:        lead.address        || '',
    next_action:    lead.next_action    || '',
    follow_up_date: lead.follow_up_date || '',
    notes:          lead.preferences?.notes || '',
    vehicle_model:  lead.preferences?.vehicle_model || '',
    variant:        lead.preferences?.variant || '',
    budget:         lead.preferences?.budget || '',
    location:       lead.preferences?.location || '',
    fuel_type:      lead.preferences?.fuel_type || '',
    transmission:   lead.preferences?.transmission || '',
    finance:        lead.preferences?.finance || '',
    test_drive:     lead.preferences?.test_drive || '',
  })

  const initials = lead.name
    ? lead.name[0] + (lead.name.split(' ')[1]?.[0] || '')
    : '?'

  const save = () => {
    const patch = {
      tag:            form.tag,
      status:         form.status,
      engagability:   form.engagability,
      address:        form.address,
      next_action:    form.next_action,
      follow_up_date: form.follow_up_date,
      preferences: {
        ...(lead.preferences || {}),
        vehicle_model: form.vehicle_model,
        variant:       form.variant,
        budget:        form.budget,
        location:      form.location,
        fuel_type:     form.fuel_type,
        transmission:  form.transmission,
        finance:       form.finance,
        test_drive:    form.test_drive,
        notes:         form.notes,
      },
    }
    onUpdate(lead.lead_id, patch)
    // persist to backend
    apiFetch(`/api/leads/${lead.lead_id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).catch(() => {})
    setEditing(false)
  }

  const callNow = async () => {
    setCalling(true)
    setCallMsg('')
    try {
      await apiFetch(`/api/leads/${lead.lead_id}/call`, { method: 'POST' })
      setCallMsg('Call initiated! Maya will connect shortly.')
    } catch (e) {
      setCallMsg(`Call failed: ${e.message}`)
    }
    setCalling(false)
  }

  const langCfg = {
    english:  { label: '🌐 English',  color: '#6366f1' },
    hindi:    { label: '🇮🇳 Hindi',    color: '#f97316' },
    hinglish: { label: '🔀 Hinglish', color: '#10b981' },
  }[lead.preferred_language] || null

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
        background: 'var(--bg-elevated)',
        borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 560,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)',
        animation: 'fadeInUp 0.18s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div className="lead-avatar" style={{ width: 48, height: 48, fontSize: 17, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 6 }}>
              {lead.name}
            </h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
              <span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span>
              {langCfg && (
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: langCfg.color, background: 'rgba(0,0,0,0.04)' }}>
                  {langCfg.label}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Contact Info */}
        <Section label="Contact Information">
          <Row icon={<Phone size={13} color="var(--brand-primary)" />}  label="Phone"   value={lead.phone} />
          <Row icon={<Mail size={13} color="var(--brand-primary)" />}   label="Email"   value={lead.email} />
          <Row icon={<Globe size={13} color="var(--brand-primary)" />}  label="Source"  value={lead.source} />
          <Row icon={<Hash size={13} color="var(--brand-primary)" />}   label="Lead ID" value={lead.lead_id} mono />
          {lead.address && <Row icon={<MapPin size={13} color="var(--brand-primary)" />} label="Address" value={lead.address} />}
          {lead.created_at && (
            <Row icon={<Calendar size={13} color="var(--brand-primary)" />} label="Added"
              value={new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
          )}
        </Section>

        {/* Preferences — view mode */}
        {lead.preferences && !editing && (
          <Section label="Vehicle Preferences">
            <Row icon={<MapPin size={13} color="#16a34a" />} label="Location"     value={lead.preferences.location} />
            <Row icon={<Home size={13} color="#16a34a" />}   label="Vehicle"      value={`${lead.preferences.vehicle_model || ''}${lead.preferences.variant ? ' ' + lead.preferences.variant : ''}`} />
            <Row icon={<Wallet size={13} color="#16a34a" />} label="Budget"       value={lead.preferences.budget} />
            {lead.preferences.transmission && <Row icon={<span style={{ fontSize: 11 }}>⚙️</span>} label="Transmission" value={lead.preferences.transmission} />}
            {lead.preferences.fuel_type    && <Row icon={<span style={{ fontSize: 11 }}>⛽</span>} label="Fuel"         value={lead.preferences.fuel_type} />}
            {lead.preferences.finance      && <Row icon={<span style={{ fontSize: 11 }}>💳</span>} label="Finance"      value={lead.preferences.finance} />}
            {lead.preferences.test_drive   && <Row icon={<span style={{ fontSize: 11 }}>🚗</span>} label="Test Drive"   value={lead.preferences.test_drive} />}
          </Section>
        )}

        {/* Lead Scores — view mode */}
        {!editing && (lead.engagability || lead.next_action || lead.follow_up_date) && (
          <Section label="CRM Details">
            {lead.engagability   && <Row icon={<span style={{ fontSize: 11 }}>📊</span>} label="Engagability"  value={lead.engagability} />}
            {lead.next_action    && <Row icon={<span style={{ fontSize: 11 }}>📋</span>} label="Next Action"   value={lead.next_action} />}
            {lead.follow_up_date && <Row icon={<Calendar size={13} color="#6366f1" />}   label="Follow-up"     value={lead.follow_up_date} />}
          </Section>
        )}

        {/* Call History — view mode */}
        {lead.call_history && lead.call_history.length > 0 && !editing && (
          <Section label={`Call History (${lead.call_history.length})`}>
            {lead.call_history.slice(0, 4).map((c, i) => (
              <div key={i} style={{
                padding: '8px 0', borderBottom: '1px solid var(--border-faint)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {c.timestamp ? new Date(c.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `Call ${i + 1}`}
                  {c.duration ? ` · ${c.duration}` : ''}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.outcome || c.status || '—'}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Edit form */}
        {editing && (
          <Section label="Update Lead Details">
            <div style={{ padding: '12px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Field label="Tag">
                  <select className="form-input" value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}>
                    <option value="Hot">🔥 Hot</option>
                    <option value="Warm">🌡 Warm</option>
                    <option value="Cold">❄ Cold</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Closed">Closed</option>
                    <option value="Lost">Lost</option>
                  </select>
                </Field>
                <Field label="Engagability">
                  <select className="form-input" value={form.engagability} onChange={e => setForm(f => ({ ...f, engagability: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Very High">Very High</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </Field>
                <Field label="Vehicle Model">
                  <input className="form-input" placeholder="e.g. Kushaq" value={form.vehicle_model}
                    onChange={e => setForm(f => ({ ...f, vehicle_model: e.target.value }))} />
                </Field>
                <Field label="Variant">
                  <input className="form-input" placeholder="e.g. Style, Monte Carlo" value={form.variant}
                    onChange={e => setForm(f => ({ ...f, variant: e.target.value }))} />
                </Field>
                <Field label="Budget">
                  <input className="form-input" placeholder="₹15–20 Lakhs" value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
                </Field>
                <Field label="Location">
                  <input className="form-input" placeholder="City / Area" value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </Field>
                <Field label="Transmission">
                  <select className="form-input" value={form.transmission} onChange={e => setForm(f => ({ ...f, transmission: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Manual">Manual</option>
                    <option value="Automatic">Automatic</option>
                    <option value="DSG">DSG</option>
                  </select>
                </Field>
                <Field label="Fuel Type">
                  <select className="form-input" value={form.fuel_type} onChange={e => setForm(f => ({ ...f, fuel_type: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </Field>
                <Field label="Finance">
                  <select className="form-input" value={form.finance} onChange={e => setForm(f => ({ ...f, finance: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Required">Required</option>
                    <option value="Self-funded">Self-funded</option>
                    <option value="Maybe">Maybe</option>
                  </select>
                </Field>
                <Field label="Test Drive">
                  <select className="form-input" value={form.test_drive} onChange={e => setForm(f => ({ ...f, test_drive: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Not Requested">Not Requested</option>
                    <option value="Requested">Requested</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed">Completed</option>
                  </select>
                </Field>
                <Field label="Follow-up Date">
                  <input type="date" className="form-input" value={form.follow_up_date}
                    onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} />
                </Field>
              </div>
              <Field label="Address">
                <input className="form-input" placeholder="Full address..." value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </Field>
              <Field label="Next Action" style={{ marginTop: 12 }}>
                <input className="form-input" placeholder="e.g. Schedule test drive call" value={form.next_action}
                  onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} />
              </Field>
              <Field label="Notes" style={{ marginTop: 12 }}>
                <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontSize: 13 }}
                  placeholder="Add a note..." value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </Field>
            </div>
          </Section>
        )}

        {/* Call feedback */}
        {callMsg && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
            background: callMsg.includes('fail') ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)',
            color: callMsg.includes('fail') ? '#ef4444' : '#16a34a',
            border: `1px solid ${callMsg.includes('fail') ? 'rgba(239,68,68,0.2)' : 'rgba(22,163,74,0.2)'}`,
          }}>
            {callMsg}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="topbar-btn btn-call"
            style={{ flex: 1, justifyContent: 'center', padding: '10px', minWidth: 120 }}
            onClick={callNow}
            disabled={calling}
          >
            <PhoneCall size={14} /> {calling ? 'Calling…' : 'Call Now'}
          </button>

          {editing ? (
            <button
              className="topbar-btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', padding: '10px', minWidth: 100 }}
              onClick={save}
            >
              <Check size={14} /> Save Changes
            </button>
          ) : (
            <button
              className="topbar-btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center', padding: '10px', minWidth: 120 }}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} /> Update
            </button>
          )}

          <button
            className="topbar-btn"
            style={{
              justifyContent: 'center', padding: '10px 14px',
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.22)',
              color: '#ef4444',
            }}
            onClick={() => { onDelete(lead.lead_id); onClose() }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Column normaliser — maps any header variant to our field name ──────────────

const COL_MAP = {
  name: 'name', full_name: 'name', fullname: 'name', 'full name': 'name',
  phone: 'phone', mobile: 'phone', contact: 'phone', 'phone number': 'phone', 'mobile number': 'phone',
  email: 'email', 'email address': 'email',
  source: 'source', 'lead source': 'source',
  preferred_language: 'preferred_language', language: 'preferred_language',
  company: 'company_name', company_name: 'company_name',
}

function normaliseRow(raw) {
  const lead = {}
  for (const [rawKey, val] of Object.entries(raw)) {
    const key = COL_MAP[rawKey.toLowerCase().trim()]
    if (key && String(val).trim()) lead[key] = String(val).trim()
  }
  return lead
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(rows.map(normaliseRow).filter(r => r.name || r.phone))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ rows, onClose, onImport }) {
  const [importing, setImporting] = useState(false)
  const [done, setDone]           = useState(0)
  const [errors, setErrors]       = useState([])
  const [finished, setFinished]   = useState(false)

  const withPhone  = rows.filter(r => r.phone).length
  const withEmail  = rows.filter(r => r.email).length
  const sources    = [...new Set(rows.map(r => r.source).filter(Boolean))]
  const pct        = rows.length ? Math.round((done / rows.length) * 100) : 0

  const runImport = async () => {
    setImporting(true)
    let count = 0
    const errs = []
    for (const row of rows) {
      try {
        await apiFetch('/api/leads', {
          method: 'POST',
          body: JSON.stringify({
            name:               row.name  || 'Unknown',
            phone:              row.phone || '',
            email:              row.email || '',
            source:             row.source || 'Import',
            preferred_language: row.preferred_language || '',
            company_name:       row.company_name || '',
            contact_consent:    true,
          }),
        })
        count++
        setDone(count)
      } catch {
        errs.push(row.name || row.phone || `Row ${count + errs.length + 1}`)
      }
    }
    setErrors(errs)
    setFinished(true)
    setImporting(false)
    if (count > 0) onImport()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(9,14,28,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      backdropFilter: 'blur(6px)',
    }} onClick={e => e.target === e.currentTarget && !importing && onClose()}>

      <div style={{
        background: 'var(--bg-elevated)',
        borderRadius: 20,
        width: '100%', maxWidth: 720,
        boxShadow: '0 24px 64px rgba(0,0,0,0.36)',
        animation: 'fadeInUp 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid var(--border-faint)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: 'var(--bg-surface)',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Lead Import
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Review before importing
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {rows.length} record{rows.length !== 1 ? 's' : ''} detected — verify the data below then confirm
            </p>
          </div>
          {!importing && (
            <button onClick={onClose} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── Summary stats ── */}
        {!finished && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-faint)' }}>
            {[
              { label: 'Total Leads',   value: rows.length,  color: 'var(--brand-primary)' },
              { label: 'With Phone',    value: withPhone,    color: '#10b981' },
              { label: 'With Email',    value: withEmail,    color: '#6366f1' },
              { label: 'Sources',       value: sources.length || '—', color: '#f59e0b' },
            ].map((s, i) => (
              <div key={s.label} style={{
                flex: 1, padding: '14px 20px',
                borderRight: i < 3 ? '1px solid var(--border-faint)' : 'none',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Preview table ── */}
        {!finished && !importing && (
          <div style={{ padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  <th style={{ width: 40, padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                  {['Name', 'Phone', 'Email', 'Source', 'Language'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-faint)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                        }}>
                          {(r.name || '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: r.phone ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: r.phone ? 'normal' : 'italic' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '10px 16px', color: r.email ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: r.email ? 'normal' : 'italic' }}>{r.email || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {r.source
                        ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-primary)', background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 6, padding: '2px 8px' }}>{r.source}</span>
                        : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{r.preferred_language || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Importing progress ── */}
        {importing && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--brand-primary)', lineHeight: 1, marginBottom: 8 }}>{pct}%</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
              Importing {done} of {rows.length} leads…
            </div>
            <div style={{ width: '100%', maxWidth: 360, height: 8, background: 'var(--bg-surface)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--brand-primary)', borderRadius: 999, width: `${pct}%`, transition: 'width 0.25s ease' }} />
            </div>
          </div>
        )}

        {/* ── Result state ── */}
        {finished && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(22,163,74,0.1)', border: '2px solid rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={26} color="#16a34a" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{done} lead{done !== 1 ? 's' : ''} imported</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>They are now live in your CRM pipeline</div>
            </div>
            {errors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', maxWidth: 380, width: '100%' }}>
                <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.5 }}>
                  {errors.length} row{errors.length > 1 ? 's' : ''} failed: {errors.join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Footer actions ── */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border-faint)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          background: 'var(--bg-surface)',
        }}>
          {!finished ? (
            <>
              <button className="topbar-btn btn-ghost" style={{ padding: '10px 22px', fontSize: 13 }}
                onClick={onClose} disabled={importing}>
                Cancel
              </button>
              <button className="topbar-btn btn-primary" style={{ padding: '10px 28px', fontSize: 13, gap: 8 }}
                onClick={runImport} disabled={importing}>
                <Upload size={14} />
                {importing ? `Importing…` : `Import ${rows.length} Lead${rows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          ) : (
            <button className="topbar-btn btn-primary" style={{ padding: '10px 32px', fontSize: 13 }} onClick={onClose}>
              Done
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Leads Page ────────────────────────────────────────────────────────────────

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', source: 'Website', preferences: {} })
  const [callingId, setCallingId] = useState(null)
  const [importRows, setImportRows] = useState(null)
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef(null)

  const handleFileSelect = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const rows = await parseFile(file)
      if (rows.length === 0) { setImportError('No valid rows found. Make sure columns include Name and/or Phone.'); return }
      setImportRows(rows)
    } catch {
      setImportError('Could not read file. Use .csv or .xlsx format.')
    }
  }

  const refreshLeads = () => apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})

  useEffect(() => { refreshLeads() }, [])

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.email?.includes(q)
    const matchTag    = !filterTag    || l.tag    === filterTag
    const matchStatus = !filterStatus || l.status === filterStatus
    return matchSearch && matchTag && matchStatus
  })

  const handleAddLead = async () => {
    try {
      const res = await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(newLead) })
      setLeads(prev => [res.lead, ...prev])
      setShowAddForm(false)
      setNewLead({ name: '', phone: '', email: '', source: 'Website', preferences: {} })
    } catch {
      alert('Failed to add lead')
    }
  }

  const deleteLead = useCallback(async (lead_id) => {
    if (!confirm('Delete this lead?')) return
    setLeads(prev => prev.filter(l => l.lead_id !== lead_id))
    try { await apiFetch(`/api/leads/${lead_id}`, { method: 'DELETE' }) } catch {}
  }, [])

  const callLead = async (lead_id) => {
    setCallingId(lead_id)
    try { await apiFetch(`/api/leads/${lead_id}/call`, { method: 'POST' }) } catch {}
    setCallingId(null)
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
        <select id="filter-tag" className="form-input" style={{ width: 130 }} value={filterTag} onChange={e => setFilterTag(e.target.value)}>
          <option value="">All Tags</option>
          <option value="Hot">🔥 Hot</option>
          <option value="Warm">🌡 Warm</option>
          <option value="Cold">❄ Cold</option>
        </select>
        <select id="filter-status" className="form-input" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="New">New</option>
          <option value="Contacted">Contacted</option>
          <option value="Qualified">Qualified</option>
          <option value="Closed">Closed</option>
        </select>
        <button
          className="topbar-btn btn-ghost"
          style={{ gap: 6 }}
          onClick={() => exportCSV(filtered, LEAD_COLUMNS, 'leads.csv')}
        >
          <Download size={14} /> Export
        </button>
        <button
          className="topbar-btn btn-ghost"
          style={{ gap: 6 }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} /> Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button id="add-lead-btn" className="topbar-btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={14} /> Add Lead
        </button>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <div className="card animate-fadeInUp" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Add New Lead</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { label: 'Name',   key: 'name',   placeholder: 'Full Name' },
              { label: 'Phone',  key: 'phone',  placeholder: '+91 98765 43210' },
              { label: 'Email',  key: 'email',  placeholder: 'email@example.com' },
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

      {/* Summary counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',    count: leads.length,                                color: 'var(--brand-primary)' },
          { label: 'Hot',      count: leads.filter(l => l.tag === 'Hot').length,   color: '#ef4444' },
          { label: 'Warm',     count: leads.filter(l => l.tag === 'Warm').length,  color: '#f59e0b' },
          { label: 'Cold',     count: leads.filter(l => l.tag === 'Cold').length,  color: '#0ea5e9' },
          { label: 'Filtered', count: filtered.length,                             color: 'var(--text-secondary)' },
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
            style={{ animationDelay: `${i * 0.05}s`, position: 'relative', cursor: 'pointer' }}
            onClick={() => navigate(`/leads/${lead.lead_id}`)}
          >
            {/* Avatar */}
            <div className="lead-avatar">
              {lead.name[0]}{lead.name.split(' ')[1]?.[0] || ''}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{lead.name}</span>
                <span className={`badge badge-${lead.tag?.toLowerCase()}`}>{lead.tag}</span>
                <span className={`badge badge-${lead.status?.toLowerCase()}`}>{lead.status}</span>
                {lead.preferred_language && (() => {
                  const cfg = {
                    english:  { label: '🌐 EN',  bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.3)',  color: '#6366f1' },
                    hindi:    { label: '🇮🇳 HI',  bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)',  color: '#f97316' },
                    hinglish: { label: '🔀 HIN', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)',  color: '#10b981' },
                  }[lead.preferred_language]
                  return cfg ? (
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  ) : null
                })()}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>📱 {lead.phone}</span>
                {lead.preferences?.location      && <span><MapPin size={10} style={{ display: 'inline' }} /> {lead.preferences.location}</span>}
                {lead.preferences?.vehicle_model && <span><Home   size={10} style={{ display: 'inline' }} /> {lead.preferences.vehicle_model}</span>}
                {lead.preferences?.budget        && <span><Wallet size={10} style={{ display: 'inline' }} /> {lead.preferences.budget}</span>}
              </div>
            </div>

            {/* Right: call count + inline actions + Call button */}
            <div
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={e => e.stopPropagation()}
            >
              {lead.call_history?.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {lead.call_history.length} call{lead.call_history.length > 1 ? 's' : ''}
                </span>
              )}

              <div className="card-actions">
                <button className="action-btn view" title="View lead"
                  onClick={() => navigate(`/leads/${lead.lead_id}`)}>
                  <Eye size={14} />
                </button>
                <button className="action-btn edit" title="Update lead"
                  onClick={() => navigate(`/leads/${lead.lead_id}/edit`)}>
                  <Pencil size={14} />
                </button>
                <button className="action-btn view" title="Call logs"
                  onClick={() => navigate(`/call-logs?lead=${lead.lead_id}`)}>
                  <FileText size={14} />
                </button>
                <button className="action-btn delete" title="Delete lead"
                  onClick={() => deleteLead(lead.lead_id)}>
                  <Trash2 size={14} />
                </button>
              </div>

              <button
                id={`call-lead-btn-${lead.lead_id}`}
                className="topbar-btn btn-call"
                style={{ fontSize: 12, padding: '6px 14px' }}
                disabled={callingId === lead.lead_id}
                onClick={() => callLead(lead.lead_id)}
              >
                <PhoneCall size={12} /> {callingId === lead.lead_id ? '…' : 'Call'}
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

      {/* Import error toast */}
      {importError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.95)', color: '#fff', fontSize: 13, fontWeight: 600,
          padding: '10px 18px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 2000,
        }}>
          <AlertCircle size={15} /> {importError}
          <button onClick={() => setImportError('')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 6 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Import modal */}
      {importRows && (
        <ImportModal
          rows={importRows}
          onClose={() => setImportRows(null)}
          onImport={() => { refreshLeads(); setImportRows(null) }}
        />
      )}
    </div>
  )
}
