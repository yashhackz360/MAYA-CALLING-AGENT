import React, { useState, useEffect } from 'react'
import {
  CheckCircle, Send, Phone, Mail, User, MapPin,
  Car, Wallet, Clock, ChevronDown, Sparkles, Shield, Zap
} from 'lucide-react'

/* ── Static Data ─────────────────────────────────────────────────────────── */

const SOURCES = [
  'Website', 'Google Ads', 'Referral', 'Auto Expo',
  'CarDekho', 'Instagram Ad', 'Showroom Walk-in', 'LinkedIn', 'Service Centre'
]

const LOCATIONS = [
  'Bangalore', 'Hyderabad', 'Chennai', 'Mumbai',
  'Pune', 'Delhi NCR', 'Kolkata', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Kochi', 'Chandigarh'
]

const VEHICLE_MODELS = [
  'Škoda Kushaq', 'Škoda Slavia', 'Škoda Superb',
  'Škoda Kodiaq', 'Škoda Karoq', 'Škoda Rapid (Pre-owned)', 'Škoda Octavia (Pre-owned)'
]

const BUDGETS = [
  '₹10–15 Lakhs', '₹15–20 Lakhs', '₹20–25 Lakhs',
  '₹25–35 Lakhs', '₹35–45 Lakhs', '₹45 Lakhs+'
]

const ENQUIRY_OPTIONS = [
  'New Purchase', 'Test Drive', 'Service Appointment',
  'Extended Warranty', 'Exchange / Trade-In', 'Accessories'
]

const LANGUAGE_OPTIONS = [
  { value: 'english',  label: '🌐 English' },
  { value: 'hindi',    label: '🇮🇳 Hindi' },
  { value: 'hinglish', label: '🔀 Hinglish' },
]

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── Animated digit counter for stats ───────────────────────────────────── */
function AnimatedStat({ value, suffix = '', label }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0
    const end = parseInt(value)
    const duration = 1800
    const step = Math.ceil(end / (duration / 16))
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setDisplay(end); clearInterval(timer) }
      else setDisplay(start)
    }, 16)
    return () => clearInterval(timer)
  }, [value])
  return (
    <div className="eq-stat">
      <div className="eq-stat-value">{display}{suffix}</div>
      <div className="eq-stat-label">{label}</div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function EnquiryPage() {
  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    source: '', preferred_language: '', contact_consent: true, communication_consent: false,
    location: '', vehicle_model: '', budget: '', enquiry_type: '', notes: ''
  })
  const [countryCode, setCountryCode] = useState('+91')
  const [submitted, setSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPrefs, setShowPrefs] = useState(false)
  const [bgLoaded, setBgLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.src = '/skoda_hero.png'
    img.onload = () => setBgLoaded(true)
    // Fallback in case image never loads
    const t = setTimeout(() => setBgLoaded(true), 2000)
    return () => clearTimeout(t)
  }, [])

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Please enter your full name'); return }
    if (!form.phone.trim()) { setError('Please enter your mobile number'); return }
    if (!form.email.trim()) { setError('Please enter your email address'); return }

    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: `${countryCode} ${form.phone.trim()}`,
        email: form.email.trim(),
        source: form.source || 'Enquiry Form',
        preferred_language: form.preferred_language || '',
        contact_consent: form.contact_consent,
        communication_consent: form.communication_consent,
        preferences: {}
      }
      if (form.location) payload.preferences.location = form.location
      if (form.vehicle_model) payload.preferences.vehicle_model = form.vehicle_model
      if (form.budget) payload.preferences.budget = form.budget
      if (form.enquiry_type) payload.preferences.enquiry_type = form.enquiry_type
      if (form.notes) payload.preferences.notes = form.notes

      try {
        const res = await fetch(`${API_BASE}/api/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) console.warn('[EnquiryPage] Backend returned', res.status, '— demo mode')
      } catch {
        console.warn('[EnquiryPage] Backend unreachable — demo mode fallback')
      }

      setSubmittedData({ ...form, countryCode })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success Screen ───────────────────────────────────────────────────── */
  if (submitted && submittedData) {
    const ticketRef = `SK-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const visitorName = submittedData.name || 'there'
    const phoneDisplay = `${submittedData.countryCode} ${submittedData.phone}`

    return (
      <div className="eq-page" style={bgLoaded ? { backgroundImage: "url('/skoda_hero.png')" } : {}}>
        <div className="eq-overlay" />
        <div className="eq-particles">
          {[...Array(12)].map((_, i) => (
            <span key={i} className="eq-particle" style={{
              '--d': `${Math.random() * 3 + 1}s`,
              '--x': `${Math.random() * 100}%`,
              '--s': `${Math.random() * 0.6 + 0.3}`,
              animationDelay: `${Math.random() * 3}s`
            }} />
          ))}
        </div>

        <div className="eq-success-wrap animate-eq-in">
          {/* Maya avatar + badge */}
          <div className="eq-success-avatar">
            <div className="eq-avatar-ring">
              <div className="eq-avatar-inner">🤖</div>
            </div>
            <div className="eq-success-badge">
              <CheckCircle size={14} /> Confirmed
            </div>
          </div>

          <h2 className="eq-success-title">You're All Set, {visitorName}!</h2>
          <p className="eq-success-sub">
            Maya — your personal Škoda AI Customer Management Executive — has been assigned to your enquiry
            and will reach out within <strong>15–30 minutes</strong>.
          </p>

          <div className="eq-success-steps">
            {[
              { icon: '📋', title: 'Enquiry Logged', desc: `Reference ID: ${ticketRef}` },
              { icon: '🤖', title: 'Maya Assigned', desc: 'AI Agent activated and briefed on your interest' },
              { icon: '📞', title: 'Expect a Call', desc: `We'll call you at ${phoneDisplay}` },
              { icon: '🚗', title: 'Vehicle Consultation', desc: 'Personalised Škoda recommendation awaits you' },
            ].map((s, i, arr) => (
              <div key={i} className={`eq-step${i < arr.length - 1 ? ' has-line' : ''}`}>
                <div className="eq-step-icon">{s.icon}</div>
                <div className="eq-step-body">
                  <div className="eq-step-title">{s.title}</div>
                  <div className="eq-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="eq-ref-pill">🔖 {ticketRef}</div>
          <p className="eq-ref-note">Save this reference ID for any follow-up queries</p>

          <button
            className="eq-submit-btn"
            onClick={() => {
              setSubmitted(false); setSubmittedData(null)
              setForm({ name: '', phone: '', email: '', source: '', preferred_language: '', contact_consent: true, communication_consent: false, location: '', vehicle_model: '', budget: '', enquiry_type: '', notes: '' })
            }}
          >
            <Send size={15} /> Submit Another Enquiry
          </button>

          <p className="eq-helpline">
            Urgent? Call Škoda Helpline: <strong>1800-209-7272</strong> &nbsp;·&nbsp; Mon–Sat, 9am–7pm
          </p>
        </div>
      </div>
    )
  }

  /* ── Main Form ────────────────────────────────────────────────────────── */
  return (
    <div className="eq-page" style={bgLoaded ? { backgroundImage: "url('/skoda_hero.png')" } : {}}>
      {/* Cinematic overlay layers */}
      <div className="eq-overlay" />
      <div className="eq-vignette" />

      {/* Floating particles */}
      <div className="eq-particles">
        {[...Array(16)].map((_, i) => (
          <span key={i} className="eq-particle" style={{
            '--d': `${Math.random() * 4 + 2}s`,
            '--x': `${Math.random() * 100}%`,
            '--s': `${Math.random() * 0.5 + 0.2}`,
            animationDelay: `${Math.random() * 5}s`
          }} />
        ))}
      </div>

      {/* Header bar */}
      <header className="eq-header animate-eq-in">
        <div className="eq-header-brand">
          <div className="eq-skoda-logo">
            <span className="eq-skoda-arrow">▶</span>
            <span className="eq-skoda-name">ŠKODA</span>
          </div>
          <div className="eq-divider-v" />
          <div className="eq-hom-badge">
            <Sparkles size={11} />
            <span>House of MantaRay</span>
          </div>
        </div>
        <div className="eq-header-status">
          <span className="eq-status-dot" />
          <span>Maya AI · Online</span>
        </div>
      </header>

      {/* Main content grid */}
      <main className="eq-main">

        {/* ── Left: Hero copy ─────────────────────────────────────── */}
        <div className="eq-hero animate-eq-in" style={{ animationDelay: '0.1s' }}>
          <div className="eq-agent-chip">
            <div className="eq-agent-orb" />
            <span>AI Customer Management Executive</span>
          </div>

          <h1 className="eq-hero-title">
            Meet <span className="eq-maya-gradient">Maya</span>
            <br />Your Personal
            <br />Škoda Advisor
          </h1>

          <p className="eq-hero-desc">
            Powered by House of MantaRay's conversational AI, Maya understands your
            preferences, recommends the perfect Škoda, and guides you through every step
            of your ownership journey.
          </p>

          {/* Stats row */}
          <div className="eq-stats">
            <AnimatedStat value="3200" suffix="+" label="Leads Managed" />
            <div className="eq-stat-sep" />
            <AnimatedStat value="98" suffix="%" label="Satisfaction" />
            <div className="eq-stat-sep" />
            <AnimatedStat value="15" suffix="min" label="Avg. Response" />
          </div>

          {/* Feature chips */}
          <div className="eq-features">
            {[
              { icon: <Zap size={14} />, text: 'Instant AI follow-up' },
              { icon: <Shield size={14} />, text: 'Verified Škoda partner' },
              { icon: <Sparkles size={14} />, text: 'Personalised consultation' },
            ].map((f, i) => (
              <div key={i} className="eq-feature-chip">
                {f.icon} {f.text}
              </div>
            ))}
          </div>

          {/* Model previews */}
          <div className="eq-models-row">
            {['Kushaq', 'Slavia', 'Kodiaq', 'Superb'].map(m => (
              <div key={m} className="eq-model-tag">Škoda {m}</div>
            ))}
          </div>
        </div>

        {/* ── Right: Glass Form Card ──────────────────────────────── */}
        <div className="eq-card animate-eq-in" style={{ animationDelay: '0.2s' }}>
          {/* Card top accent */}
          <div className="eq-card-accent" />

          <div className="eq-card-header">
            <div className="eq-card-avatar">
              <div className="eq-avatar-pulse" />
              🤖
            </div>
            <div>
              <h2 className="eq-card-title">Enquire with Maya</h2>
              <p className="eq-card-sub">Škoda AI · Powered by House of MantaRay</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">

            {/* Name */}
            <div className="eq-field">
              <label className="eq-label">Full Name <span className="eq-req">*</span></label>
              <div className="eq-input-wrap">
                <User size={15} className="eq-input-icon" />
                <input
                  type="text"
                  className="eq-input"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  id="eq-name"
                />
              </div>
            </div>

            {/* Mobile */}
            <div className="eq-field">
              <label className="eq-label">Mobile Number <span className="eq-req">*</span></label>
              <div className="eq-phone-row">
                <select
                  className="eq-code-select"
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  id="eq-country-code"
                >
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+971">🇦🇪 +971</option>
                </select>
                <div className="eq-input-wrap" style={{ flex: 1 }}>
                  <Phone size={15} className="eq-input-icon" />
                  <input
                    type="tel"
                    className="eq-input"
                    placeholder="Mobile number"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    id="eq-phone"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="eq-field">
              <label className="eq-label">Email Address <span className="eq-req">*</span></label>
              <div className="eq-input-wrap">
                <Mail size={15} className="eq-input-icon" />
                <input
                  type="email"
                  className="eq-input"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={e => updateField('email', e.target.value)}
                  id="eq-email"
                />
              </div>
            </div>

            {/* Source */}
            <div className="eq-field">
              <label className="eq-label">How did you hear about us?</label>
              <select
                className="eq-select"
                value={form.source}
                onChange={e => updateField('source', e.target.value)}
                id="eq-source"
              >
                <option value="">Select source</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Language Preference */}
            <div className="eq-field">
              <label className="eq-label">Preferred Call Language</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LANGUAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('preferred_language', form.preferred_language === opt.value ? '' : opt.value)}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: form.preferred_language === opt.value
                        ? '1.5px solid #4ade80'
                        : '1.5px solid rgba(255,255,255,0.15)',
                      background: form.preferred_language === opt.value
                        ? 'rgba(74,222,128,0.12)'
                        : 'rgba(255,255,255,0.05)',
                      color: form.preferred_language === opt.value ? '#4ade80' : 'rgba(255,255,255,0.7)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontWeight: form.preferred_language === opt.value ? 600 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Preferences Toggle */}
            <button
              type="button"
              className="eq-prefs-toggle"
              onClick={() => setShowPrefs(!showPrefs)}
              id="eq-prefs-toggle"
            >
              <span><Car size={14} /> Vehicle Preferences {showPrefs ? '(hide)' : '(optional)'}</span>
              <ChevronDown size={15} style={{ transform: showPrefs ? 'rotate(180deg)' : 'none', transition: '0.25s' }} />
            </button>

            {showPrefs && (
              <div className="eq-prefs animate-eq-in">
                <div className="eq-prefs-grid">
                  <div className="eq-field">
                    <label className="eq-label"><MapPin size={12} /> City</label>
                    <select className="eq-select" value={form.location} onChange={e => updateField('location', e.target.value)}>
                      <option value="">Select city</option>
                      {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="eq-field">
                    <label className="eq-label"><Car size={12} /> Model of Interest</label>
                    <select className="eq-select" value={form.vehicle_model} onChange={e => updateField('vehicle_model', e.target.value)}>
                      <option value="">Select model</option>
                      {VEHICLE_MODELS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="eq-field">
                    <label className="eq-label"><Wallet size={12} /> Budget Range</label>
                    <select className="eq-select" value={form.budget} onChange={e => updateField('budget', e.target.value)}>
                      <option value="">Select budget</option>
                      {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="eq-field">
                    <label className="eq-label"><Clock size={12} /> Enquiry Type</label>
                    <select className="eq-select" value={form.enquiry_type} onChange={e => updateField('enquiry_type', e.target.value)}>
                      <option value="">Select type</option>
                      {ENQUIRY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="eq-field">
                  <label className="eq-label">Additional Notes</label>
                  <textarea
                    className="eq-textarea"
                    placeholder="Any specific requirements or questions..."
                    value={form.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    rows={3}
                    id="eq-notes"
                  />
                </div>
              </div>
            )}

            {/* Consent */}
            <div className="eq-consents">
              <label className="eq-consent-label">
                <input
                  type="checkbox"
                  checked={form.contact_consent}
                  onChange={e => updateField('contact_consent', e.target.checked)}
                  id="eq-consent-contact"
                />
                <span>I consent to being contacted regarding this enquiry</span>
              </label>
              <label className="eq-consent-label">
                <input
                  type="checkbox"
                  checked={form.communication_consent}
                  onChange={e => updateField('communication_consent', e.target.checked)}
                  id="eq-consent-comm"
                />
                <span>I agree to be contacted via call, SMS, email or WhatsApp by Škoda</span>
              </label>
            </div>

            {error && <div className="eq-error" role="alert">⚠ {error}</div>}

            <button
              type="submit"
              className="eq-submit-btn"
              disabled={submitting}
              id="eq-submit-btn"
            >
              {submitting ? (
                <><span className="eq-spinner" /> Connecting to Maya...</>
              ) : (
                <><Send size={15} /> Submit to Maya</>
              )}
            </button>

            <p className="eq-footer-note">
              🔒 Your data is secure. By submitting, you agree to our privacy policy.
              <br />
              <span style={{ opacity: 0.6 }}>Powered by House of MantaRay · Škoda Verified Partner</span>
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
