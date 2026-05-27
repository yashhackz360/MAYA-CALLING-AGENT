import React, { useState } from 'react'
import {
  CreditCard, Download, MoreVertical, Eye,
  Trash2, CheckCircle, Clock, FileText, X, AlertCircle, ChevronDown
} from 'lucide-react'
import { apiFetch } from '../App.jsx'

// ─── Sample Invoices (in-memory, matches project pattern) ────────────────────

const INITIAL_INVOICES = [
  {
    id: 'INV-001',
    amount: 2500,
    currency: 'INR',
    due_date: '2026-05-10',
    status: 'pending',
    description: 'ElevenLabs Agent Subscription — Monthly',
    service: 'ElevenLabs',
    paid_on: null,
  },
  {
    id: 'INV-002',
    amount: 1800,
    currency: 'INR',
    due_date: '2026-04-25',
    status: 'pending',
    description: 'Twilio Phone Service — Monthly',
    service: 'Twilio',
    paid_on: null,
  },
]

// ─── Menu item style ─────────────────────────────────────────────────────────

const MENU_ITEM = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '9px 14px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary)',
  textAlign: 'left',
}

// ─── Load Razorpay SDK lazily ─────────────────────────────────────────────────

function loadRazorpay() {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    paid:    { label: 'Paid',    color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
    pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    overdue: { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  }[status] || { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.12)' }

  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.color}33`,
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function DetailModal({ invoice, onClose, onPay, paying }) {
  const rows = [
    ['Invoice #',   invoice.id],
    ['Service',     invoice.service],
    ['Description', invoice.description],
    ['Amount',      `₹${invoice.amount.toLocaleString('en-IN')} ${invoice.currency}`],
    ['Due Date',    new Date(invoice.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Status',      invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)],
    ...(invoice.paid_on
      ? [['Paid On', new Date(invoice.paid_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })]]
      : []),
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-elevated)',
        borderRadius: 16,
        padding: 32,
        width: '100%',
        maxWidth: 460,
        boxShadow: 'var(--shadow-lg)',
        animation: 'fadeInUp 0.18s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {invoice.id}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{invoice.service}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '4px 16px', marginBottom: 24 }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--border-faint)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="topbar-btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
            onClick={() => { onPay(invoice); onClose() }}
            disabled={paying === invoice.id}
          >
            <CreditCard size={14} />
            {paying === invoice.id ? 'Loading…' : invoice.status === 'paid' ? 'Pay Again' : 'Pay Now'}
          </button>
          <button
            className="topbar-btn btn-ghost"
            style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
            onClick={() => window.print()}
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cost Estimation ──────────────────────────────────────────────────────────

const CALLS_PER_DAY  = 50
const MINS_PER_CALL  = 5
const DAYS_PER_MONTH = 22   // working days (Mon–Fri)
const USD_TO_INR     = 83

const SERVICES = [
  {
    name:   'ElevenLabs',
    desc:   'Conversational AI Agent — TTS + STT bundled, Growth plan rate',
    rate:   '$0.05 / min',
    perMin: 0.05,
    color:  '#4f46e5',
    dot:    '#6366f1',
  },
  {
    name:   'Twilio',
    desc:   'Outbound calls to India (+91 mobile), committed-use rate',
    rate:   '$0.040 / min',
    perMin: 0.040,
    color:  '#e53935',
    dot:    '#ef4444',
  },
  {
    name:   'AI Language Model',
    desc:   'LLM brain — conversation engine, ~2 K tokens per call',
    rate:   '~$0.001 / call',
    perMin: 0.001 / MINS_PER_CALL,
    color:  '#f59e0b',
    dot:    '#fbbf24',
  },
  {
    name:   'Server / Hosting',
    desc:   'VPS + tunnel, amortised across all calls',
    rate:   '$15 flat / month',
    perMin: 15 / (CALLS_PER_DAY * DAYS_PER_MONTH * MINS_PER_CALL),
    color:  '#10b981',
    dot:    '#34d399',
  },
]

const ASSUMPTIONS = [
  `${CALLS_PER_DAY} outbound calls per day, average duration ${MINS_PER_CALL} minutes each — ${CALLS_PER_DAY * MINS_PER_CALL} agent-minutes per working day.`,
  `${DAYS_PER_MONTH} working days per month assumed (Monday–Friday), excluding weekends and public holidays.`,
  'ElevenLabs rate of $0.05/min reflects the Growth-plan tier pricing — includes TTS synthesis and STT transcription bundled in the Conversational AI product.',
  'Twilio outbound rate of $0.040/min is the committed-use (volume-discount) India mobile rate; standard pay-as-you-go is slightly higher at $0.077/min.',
  'AI Language Model estimated at ~2,000 input tokens + ~500 output tokens per call. Figure is derived from comparable model rates.',
  `USD → INR conversion fixed at ₹${USD_TO_INR} per dollar (May 2026 rate) — adjust if the exchange rate changes significantly.`,
  'Hosting ($15/month) covers a lightweight VPS running the FastAPI backend 24 × 7 plus an ngrok/tunnel subscription.',
  'Razorpay payment-gateway fees (2 % + ₹3 per transaction) are excluded from this estimate.',
  'Human-agent escalation time, lead-acquisition spend, and per-seat CRM or telephony plan fees are not included.',
  'Cost scales roughly linearly with call volume — doubling daily calls doubles the ElevenLabs and Twilio line items while hosting stays flat.',
]

function fmt(usd) {
  return {
    usd: usd < 0.01 ? '<$0.01' : `$${usd.toFixed(usd < 1 ? 3 : 2)}`,
    inr: `₹${Math.round(usd * USD_TO_INR).toLocaleString('en-IN')}`,
  }
}

function CostEstimation() {
  const [open, setOpen] = useState(false)

  const rows = SERVICES.map(s => {
    const perCall = s.perMin * MINS_PER_CALL
    const daily   = perCall  * CALLS_PER_DAY
    const monthly = daily    * DAYS_PER_MONTH
    return { ...s, perCall, daily, monthly }
  })

  const totalPerCall = rows.reduce((a, r) => a + r.perCall,  0)
  const totalDaily   = rows.reduce((a, r) => a + r.daily,    0)
  const totalMonthly = rows.reduce((a, r) => a + r.monthly,  0)

  const summaryCards = [
    { label: 'Per Call',              usd: totalPerCall,  color: '#4f46e5', gradient: 'linear-gradient(90deg,#4f46e5,#6366f1)' },
    { label: `Daily (${CALLS_PER_DAY} calls)`, usd: totalDaily, color: '#f59e0b', gradient: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
    { label: `Monthly (${DAYS_PER_MONTH} days)`, usd: totalMonthly, color: '#10b981', gradient: 'linear-gradient(90deg,#10b981,#34d399)' },
  ]

  return (
    <div className="card" style={{ marginTop: 24 }}>
      {/* ── Toggle header — always visible ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderRadius: open ? '14px 14px 0 0' : 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="card-title" style={{ margin: 0 }}>Estimated Running Cost</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px',
            borderRadius: 999, background: 'rgba(245,158,11,0.12)',
            color: '#f59e0b', border: '1px solid rgba(245,158,11,0.28)',
          }}>
            APPROXIMATE
          </span>
          {!open && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>
              · ~{fmt(totalMonthly).inr}/month · click to expand
            </span>
          )}
        </div>
        <ChevronDown
          size={18}
          color="var(--text-muted)"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.22s ease', flexShrink: 0 }}
        />
      </button>

      {/* ── Collapsible body ── */}
      {open && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '4px 20px 16px' }}>
            {summaryCards.map((c, i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': c.gradient, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginBottom: 2 }}>
                  {fmt(c.usd).inr}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(c.usd).usd}</div>
              </div>
            ))}
          </div>

          {/* Breakdown table */}
          <div style={{ overflowX: 'auto', padding: '0 20px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Description</th>
                  <th>Rate</th>
                  <th>Per Call</th>
                  <th>Daily (50)</th>
                  <th>Monthly</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.dot, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: r.color, fontSize: 13 }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>{r.desc}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.rate}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{fmt(r.perCall).inr}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(r.perCall).usd}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{fmt(r.daily).inr}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(r.daily).usd}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: r.color, fontSize: 13 }}>{fmt(r.monthly).inr}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(r.monthly).usd}</span>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--bg-surface)', borderTop: '2px solid var(--border-subtle)' }}>
                  <td colSpan={3} style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', paddingTop: 12 }}>
                    Total (all services)
                  </td>
                  <td style={{ paddingTop: 12 }}>
                    <span style={{ fontWeight: 800, color: '#4f46e5', fontSize: 14 }}>{fmt(totalPerCall).inr}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(totalPerCall).usd}</span>
                  </td>
                  <td style={{ paddingTop: 12 }}>
                    <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: 14 }}>{fmt(totalDaily).inr}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(totalDaily).usd}</span>
                  </td>
                  <td style={{ paddingTop: 12 }}>
                    <span style={{ fontWeight: 800, color: '#10b981', fontSize: 15 }}>{fmt(totalMonthly).inr}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{fmt(totalMonthly).usd}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Assumptions */}
          <div style={{ padding: '18px 20px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Points Considered in This Approximation
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ASSUMPTIONS.map((a, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{a}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Billing Page ─────────────────────────────────────────────────────────────

export default function Billing() {
  const [invoices, setInvoices] = useState(INITIAL_INVOICES)
  const [selected, setSelected] = useState([])
  const [openMenu, setOpenMenu] = useState(null)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [paying, setPaying] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const toggleSelect = id =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const toggleAll = () =>
    setSelected(s => s.length === invoices.length ? [] : invoices.map(i => i.id))

  const deleteInvoice = id => {
    setInvoices(invs => invs.filter(i => i.id !== id))
    setOpenMenu(null)
    showToast('Invoice deleted.')
  }

  const handlePay = async (invoice) => {
    setPaying(invoice.id)
    setOpenMenu(null)

    const loaded = await loadRazorpay()
    if (!loaded) {
      showToast('Failed to load payment gateway. Try again.', 'error')
      setPaying(null)
      return
    }

    const rzpKey = import.meta.env.VITE_RAZORPAY_KEY_ID
    if (!rzpKey) {
      showToast('Razorpay key not configured (VITE_RAZORPAY_KEY_ID).', 'error')
      setPaying(null)
      return
    }

    try {
      const order = await apiFetch('/api/billing/create-order', {
        method: 'POST',
        body: JSON.stringify({
          amount: invoice.amount,
          currency: invoice.currency,
          invoice_id: invoice.id,
        }),
      })

      const options = {
        key: rzpKey,
        amount: order.amount,
        currency: order.currency,
        name: 'MantaRay AI',
        description: invoice.description,
        order_id: order.id,
        handler: async (response) => {
          try {
            await apiFetch('/api/billing/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                invoice_id: invoice.id,
              }),
            })
            setInvoices(invs => invs.map(i =>
              i.id === invoice.id
                ? { ...i, status: 'paid', paid_on: new Date().toISOString().split('T')[0] }
                : i
            ))
            showToast(`Payment successful! ${invoice.id} marked as Paid.`)
          } catch {
            showToast('Payment verification failed. Contact support.', 'error')
          }
          setPaying(null)
        },
        prefill: { email: 'admin@mantaray.ai' },
        theme: { color: '#4ba82e' },
        modal: { ondismiss: () => setPaying(null) },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      showToast('Could not initiate payment. Check backend configuration.', 'error')
      setPaying(null)
    }
  }

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0)

  const summaryCards = [
    {
      label: 'Total Invoices',
      value: invoices.length,
      icon: FileText,
      color: '#4f46e5',
      bg: 'rgba(79,70,229,0.08)',
      gradient: 'linear-gradient(90deg, #4f46e5, #6366f1)',
    },
    {
      label: 'Amount Paid',
      value: `₹${totalPaid.toLocaleString('en-IN')}`,
      icon: CheckCircle,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.08)',
      gradient: 'linear-gradient(90deg, #10b981, #34d399)',
    },
    {
      label: 'Amount Due',
      value: `₹${totalPending.toLocaleString('en-IN')}`,
      icon: Clock,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.08)',
      gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    },
  ]

  return (
    <div className="animate-fadeInUp">

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '12px 20px',
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeInUp 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        {summaryCards.map((s, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': s.gradient, animationDelay: `${i * 0.05}s` }}>
            <div className="stat-icon" style={{ background: s.bg }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div className="stat-value" style={{ marginTop: 10 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Invoice table card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Invoices</span>
          <button
            className="topbar-btn btn-primary"
            style={{ fontSize: 13, padding: '8px 18px' }}
            onClick={() => window.print()}
          >
            <Download size={14} /> Download Invoice
          </button>
        </div>

        <div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>
                  <input
                    type="checkbox"
                    checked={selected.length === invoices.length && invoices.length > 0}
                    onChange={toggleAll}
                    style={{ accentColor: '#4ba82e', cursor: 'pointer' }}
                  />
                </th>
                <th>Invoice Number</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      style={{ accentColor: '#4ba82e', cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.id}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: 14 }}>
                      ₹{inv.amount.toLocaleString('en-IN')} {inv.currency}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {new Date(inv.due_date).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{inv.description}</td>

                  {/* Action cell — relative so dropdown positions correctly */}
                  <td style={{ textAlign: 'right', position: 'relative' }}>
                    <button
                      onClick={() => setOpenMenu(openMenu === inv.id ? null : inv.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '5px 8px', borderRadius: 6,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenu === inv.id && (
                      <>
                        {/* Click-outside overlay */}
                        <div
                          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                          onClick={() => setOpenMenu(null)}
                        />
                        {/* Dropdown menu */}
                        <div style={{
                          position: 'absolute', right: 8, top: '100%', zIndex: 100,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 10,
                          boxShadow: 'var(--shadow-md)',
                          padding: '5px 0',
                          minWidth: 140,
                        }}>
                          <button
                            style={{ ...MENU_ITEM }}
                            onClick={() => { setDetailInvoice(inv); setOpenMenu(null) }}
                          >
                            <Eye size={14} color="#4f46e5" /> Detail
                          </button>
                          <button
                            style={{ ...MENU_ITEM, color: inv.status === 'paid' ? 'var(--text-muted)' : '#10b981' }}
                            onClick={() => handlePay(inv)}
                            disabled={paying === inv.id}
                          >
                            <CreditCard size={14} />
                            {paying === inv.id ? 'Loading…' : inv.status === 'paid' ? 'Pay Again' : 'Pay'}
                          </button>
                          <button
                            style={{ ...MENU_ITEM, color: '#ef4444' }}
                            onClick={() => deleteInvoice(inv.id)}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cost Estimation ──────────────────────────────────────────────── */}
      <CostEstimation />

      {/* Razorpay info banner */}
      <div style={{
        marginTop: 18,
        padding: '14px 18px',
        background: 'rgba(79,70,229,0.05)',
        border: '1px solid rgba(79,70,229,0.15)',
        borderRadius: 12,
        fontSize: 13,
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <CreditCard size={15} color="#4f46e5" />
        Payments are securely processed via{' '}
        <strong style={{ color: 'var(--text-primary)' }}>Razorpay</strong>.
        Set <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>RAZORPAY_KEY_ID</code> in
        backend <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>.env</code> and
        <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>VITE_RAZORPAY_KEY_ID</code> in
        frontend <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>.env</code> to enable live payments.
      </div>

      {/* Detail modal */}
      {detailInvoice && (
        <DetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onPay={handlePay}
          paying={paying}
        />
      )}
    </div>
  )
}
