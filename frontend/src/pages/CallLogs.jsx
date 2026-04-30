import React, { useState, useEffect } from 'react'
import { apiFetch } from '../App.jsx'
import { Clock, User, Phone, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

export default function CallLogs() {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    apiFetch('/api/calls/logs').then(d => setLogs(d.logs || [])).catch(() => {})

    // Also show some sample logs if empty
    setLogs([
      {
        call_id: 'CALL-DEMO1',
        lead_id: 'lead_003',
        caller: 'Škoda Customer Care AI (Maya)',
        recipient: 'Ananya Reddy',
        phone: '+91 76543 21098',
        duration: '3:24',
        status: 'Completed',
        outcome: 'Interested – test drive booked',
        date: new Date(Date.now() - 72000000).toISOString(),
        escalated: false,
        transcript: []
      }
    ])
  }, [])

  return (
    <div className="animate-fadeInUp">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Call History</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{logs.length} calls</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Call ID</th>
                <th>Agent</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Date</th>
                <th>Escalated</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={`${log.call_id}-${i}`}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-secondary)' }}>
                      {log.call_id}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span>🤖</span> Maya
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={12} style={{ color: 'var(--text-muted)' }} />
                      {log.recipient}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <Phone size={11} style={{ color: 'var(--text-muted)' }} />
                      {log.phone}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                      {log.duration}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-qualified">{log.status}</span>
                  </td>
                  <td style={{ maxWidth: 200, fontSize: 12 }}>{log.outcome}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(log.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {log.escalated
                      ? <span style={{ color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Yes</span>
                      : <span style={{ color: '#10b981', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> No</span>
                    }
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No call logs yet. Start a call from the Call Console.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
