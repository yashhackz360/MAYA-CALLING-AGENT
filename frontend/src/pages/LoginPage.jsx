import React, { useState } from 'react'
import { LogIn, Eye, EyeOff, Shield, AlertCircle, Phone, Zap, BarChart3, Bot } from 'lucide-react'

// ─── Demo Credentials ─────────────────────────────────────────────────────────
const DEMO_CREDENTIALS = [
  { username: 'admin', password: 'admin123', role: 'Admin' },
  { username: 'demo', password: 'demo123', role: 'Demo User' },
  { username: 'manager', password: 'manager123', role: 'Manager' },
]

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    setTimeout(() => {
      const match = DEMO_CREDENTIALS.find(
        c => c.username === username.trim().toLowerCase() && c.password === password
      )
      if (match) {
        onLogin({ username: match.username, role: match.role })
      } else {
        setError('Invalid credentials. Try one of the demo accounts below.')
      }
      setLoading(false)
    }, 800)
  }

  const handleQuickLogin = (cred) => {
    setUsername(cred.username)
    setPassword(cred.password)
    setError('')
  }

  return (
    <div className="login-page">
      {/* Subtle background shapes */}
      <div className="login-bg-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>

      <div className="login-container">
        {/* Left — Branding */}
        <div className="login-branding">
          <div className="login-logo-box">
            <Phone size={28} color="#fff" />
          </div>
          <h1 className="login-brand-title">MantaRay AI</h1>
          <p className="login-brand-sub">Škoda Auto India · AI Voice Agent</p>

          <div className="login-features">
            <div className="login-feature-item">
              <div className="login-feature-dot" />
              <span>AI-Powered Customer Calling</span>
            </div>
            <div className="login-feature-item">
              <div className="login-feature-dot" />
              <span>Real-Time Voice Conversation</span>
            </div>
            <div className="login-feature-item">
              <div className="login-feature-dot" />
              <span>Intelligent Lead Qualification</span>
            </div>
            <div className="login-feature-item">
              <div className="login-feature-dot" />
              <span>Powered by xAI Grok</span>
            </div>
          </div>
        </div>

        {/* Right — Form */}
        <div className="login-form-panel">
          <div className="login-form-card">
            <div className="login-form-header">
              <Shield size={20} color="#4ba82e" />
              <h2>Sign In</h2>
            </div>
            <p className="login-form-desc">Enter your credentials to access the dashboard</p>

            <form onSubmit={handleSubmit} autoComplete="off">
              {error && (
                <div className="login-error">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <div className="login-field">
                <label htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-password-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPassword(p => !p)}
                    tabIndex={-1}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading ? (
                  <span className="login-spinner" />
                ) : (
                  <>
                    <LogIn size={16} />
                    Sign In
                  </>
                )}
              </button>
            </form>

            {/* Quick-access demo credentials */}
            <div className="login-demo-section">
              <div className="login-demo-label">Demo Accounts — click to autofill</div>
              <div className="login-demo-cards">
                {DEMO_CREDENTIALS.map(c => (
                  <button
                    key={c.username}
                    className="login-demo-chip"
                    onClick={() => handleQuickLogin(c)}
                    type="button"
                  >
                    <span className="demo-chip-role">{c.role}</span>
                    <span className="demo-chip-user">{c.username} / {c.password}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="login-footer-text">
            © 2026 House of Mantaray · Powered by xAI Grok
          </p>
        </div>
      </div>
    </div>
  )
}
