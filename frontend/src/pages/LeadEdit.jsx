import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { apiFetch } from '../App.jsx'

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

export default function LeadEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    tag: '', status: '', engagability: '', address: '', next_action: '',
    follow_up_date: '', notes: '', vehicle_model: '', variant: '',
    budget: '', location: '', fuel_type: '', transmission: '', finance: '', test_drive: '',
  })

  useEffect(() => {
    apiFetch(`/api/leads/${id}`).then(lead => {
      setLead(lead)
      setForm({
        tag:            lead.tag            || 'Warm',
        status:         lead.status         || 'New',
        engagability:   lead.engagability   || '',
        address:        lead.address        || '',
        next_action:    lead.next_action    || '',
        follow_up_date: lead.follow_up_date || '',
        notes:          lead.preferences?.notes          || '',
        vehicle_model:  lead.preferences?.vehicle_model  || '',
        variant:        lead.preferences?.variant        || '',
        budget:         lead.preferences?.budget         || '',
        location:       lead.preferences?.location       || '',
        fuel_type:      lead.preferences?.fuel_type      || '',
        transmission:   lead.preferences?.transmission   || '',
        finance:        lead.preferences?.finance        || '',
        test_drive:     lead.preferences?.test_drive     || '',
      })
    }).catch(() => navigate('/leads'))
  }, [id])

  const save = async () => {
    setSaving(true)
    const patch = {
      tag: form.tag, status: form.status,
      engagability: form.engagability, address: form.address,
      next_action: form.next_action, follow_up_date: form.follow_up_date,
      preferences: {
        ...(lead?.preferences || {}),
        vehicle_model: form.vehicle_model, variant: form.variant,
        budget: form.budget, location: form.location,
        fuel_type: form.fuel_type, transmission: form.transmission,
        finance: form.finance, test_drive: form.test_drive, notes: form.notes,
      },
    }
    await apiFetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {})
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); navigate(`/leads/${id}`) }, 800)
  }

  if (!lead) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading…</div>
  )

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="animate-fadeInUp" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button className="log-detail-back" onClick={() => navigate(`/leads/${id}`)}>
          <ArrowLeft size={15} /> {lead.name}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-btn btn-ghost" onClick={() => navigate(`/leads/${id}`)}>
            <X size={14} /> Cancel
          </button>
          <button className="topbar-btn btn-primary" style={{ minWidth: 120, justifyContent: 'center' }} onClick={save} disabled={saving || saved}>
            <Check size={14} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Editing Lead</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{lead.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{lead.phone} · {lead.email}</div>
      </div>

      {/* Form sections */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>CRM Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <Field label="Tag">
            <select className="form-input" value={form.tag} onChange={set('tag')}>
              <option value="Hot">🔥 Hot</option>
              <option value="Warm">🌡 Warm</option>
              <option value="Cold">❄ Cold</option>
            </select>
          </Field>
          <Field label="Status">
            <select className="form-input" value={form.status} onChange={set('status')}>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Closed">Closed</option>
              <option value="Lost">Lost</option>
            </select>
          </Field>
          <Field label="Engagability">
            <select className="form-input" value={form.engagability} onChange={set('engagability')}>
              <option value="">— Select —</option>
              <option value="Very High">Very High</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </Field>
          <Field label="Follow-up Date">
            <input type="date" className="form-input" value={form.follow_up_date} onChange={set('follow_up_date')} />
          </Field>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, marginTop: 8 }}>Vehicle Preferences</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <Field label="Vehicle Model">
            <input className="form-input" placeholder="e.g. Kushaq" value={form.vehicle_model} onChange={set('vehicle_model')} />
          </Field>
          <Field label="Variant">
            <input className="form-input" placeholder="e.g. Style, Monte Carlo" value={form.variant} onChange={set('variant')} />
          </Field>
          <Field label="Budget">
            <input className="form-input" placeholder="₹15–20 Lakhs" value={form.budget} onChange={set('budget')} />
          </Field>
          <Field label="Location">
            <input className="form-input" placeholder="City / Area" value={form.location} onChange={set('location')} />
          </Field>
          <Field label="Transmission">
            <select className="form-input" value={form.transmission} onChange={set('transmission')}>
              <option value="">— Select —</option>
              <option value="Manual">Manual</option>
              <option value="Automatic">Automatic</option>
              <option value="DSG">DSG</option>
            </select>
          </Field>
          <Field label="Fuel Type">
            <select className="form-input" value={form.fuel_type} onChange={set('fuel_type')}>
              <option value="">— Select —</option>
              <option value="Petrol">Petrol</option>
              <option value="Diesel">Diesel</option>
              <option value="CNG">CNG</option>
              <option value="Electric">Electric</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </Field>
          <Field label="Finance">
            <select className="form-input" value={form.finance} onChange={set('finance')}>
              <option value="">— Select —</option>
              <option value="Required">Required</option>
              <option value="Self-funded">Self-funded</option>
              <option value="Maybe">Maybe</option>
            </select>
          </Field>
          <Field label="Test Drive">
            <select className="form-input" value={form.test_drive} onChange={set('test_drive')}>
              <option value="">— Select —</option>
              <option value="Not Requested">Not Requested</option>
              <option value="Requested">Requested</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
            </select>
          </Field>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, marginTop: 8 }}>Additional Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Address">
            <input className="form-input" placeholder="Full address..." value={form.address} onChange={set('address')} />
          </Field>
          <Field label="Next Action">
            <input className="form-input" placeholder="e.g. Schedule test drive call" value={form.next_action} onChange={set('next_action')} />
          </Field>
          <Field label="Notes">
            <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontSize: 13 }}
              placeholder="Add a note..." value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="topbar-btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '12px' }} onClick={save} disabled={saving || saved}>
          <Check size={14} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button className="topbar-btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '12px' }} onClick={() => navigate(`/leads/${id}`)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
