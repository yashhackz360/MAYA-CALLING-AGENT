import React, { useState, useEffect } from 'react'
import { apiFetch } from '../App.jsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#06b6d4']

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null)
  const [leads, setLeads] = useState([])

  useEffect(() => {
    apiFetch('/api/analytics').then(setAnalytics).catch(() => {})
    apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})
  }, [])

  const a = analytics || {
    total_leads: 5, hot_leads: 2, warm_leads: 2, cold_leads: 1,
    contacted: 1, qualified: 1, calls_today: 0, total_calls: 0,
    conversion_rate: 20
  }

  const pieData = [
    { name: '🔥 Hot', value: a.hot_leads },
    { name: '🌡 Warm', value: a.warm_leads },
    { name: '❄ Cold', value: a.cold_leads },
  ]

  const statusData = [
    { name: 'New', value: a.total_leads - a.contacted - a.qualified },
    { name: 'Contacted', value: a.contacted },
    { name: 'Qualified', value: a.qualified },
  ]

  const weeklyData = [
    { day: 'Mon', leads: 3, calls: 2, qualified: 1 },
    { day: 'Tue', leads: 5, calls: 4, qualified: 2 },
    { day: 'Wed', leads: 2, calls: 2, qualified: 1 },
    { day: 'Thu', leads: 7, calls: 5, qualified: 3 },
    { day: 'Fri', leads: 4, calls: 3, qualified: 2 },
    { day: 'Sat', leads: 6, calls: 4, qualified: 2 },
    { day: 'Sun', leads: 1, calls: 1, qualified: 0 },
  ]

  const sourceData = leads.reduce((acc, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1
    return acc
  }, {})
  const sourceChartData = Object.entries(sourceData).map(([name, value]) => ({ name, value }))

  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    color: '#111827',
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  }

  return (
    <div className="animate-fadeInUp">
      {/* KPIs */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Conversion Rate', value: `${a.conversion_rate}%`, color: '#10b981' },
          { label: 'Total Calls', value: a.total_calls, color: '#6366f1' },
          { label: 'Avg Response Time', value: '< 2min', color: '#06b6d4' },
          { label: 'Call Success Rate', value: '78%', color: '#f59e0b' },
        ].map((kpi, i) => (
          <div key={i} className="stat-card" style={{ '--card-accent': `linear-gradient(90deg, ${kpi.color}, ${kpi.color}88)` }}>
            <div className="stat-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="stat-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Weekly Trend */}
        <div className="card">
          <div className="card-header"><span className="card-title">Weekly Activity</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="leads" stroke="#4f46e5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="calls" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="qualified" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Tags Pie */}
        <div className="card">
          <div className="card-header"><span className="card-title">Lead Temperature</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6'][i]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Lead Status Bar */}
        <div className="card">
          <div className="card-header"><span className="card-title">Pipeline Status</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map((_, i) => <Cell key={i} fill={['#8b5cf6', '#06b6d4', '#10b981'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Source */}
        <div className="card">
          <div className="card-header"><span className="card-title">Lead Sources</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#6b7280', fontSize: 11 }} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
