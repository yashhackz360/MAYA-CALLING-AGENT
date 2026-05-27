# MantaRay AI — Frontend

React 18 + Vite frontend for the MantaRay AI calling agent. Provides the CRM dashboard, lead management, live enquiry feed, call logs, analytics, billing, and the public customer enquiry form.

---

## Architecture

```
frontend/src/
├── main.jsx                     # App entry point — renders <App />
├── App.jsx                      # BrowserRouter, Routes, Sidebar, TopBar, auth gate
├── index.css                    # Global design system (CSS variables, components, animations)
│
└── pages/
    ├── Dashboard.jsx            # KPI cards, pipeline, recent leads, LeadToast notifications
    ├── Leads.jsx                # Lead table with search, tag filters, inline call trigger
    ├── LeadDetail.jsx           # Full-page lead profile (read-only view)
    ├── LeadEdit.jsx             # Full-page lead edit form (PATCH API)
    ├── LeadGeneration.jsx       # Real-time WebSocket enquiry feed
    ├── CallLogs.jsx             # Call history table with ?lead= URL filter
    ├── CallLogEdit.jsx          # Edit call log record (front-end state)
    ├── Campaigns.jsx            # Campaign performance tracking
    ├── Analytics.jsx            # Deep-dive metrics with Recharts
    ├── Billing.jsx              # Invoices, Razorpay payment integration
    ├── EnquiryPage.jsx          # Public customer enquiry form (no auth)
    └── LoginPage.jsx            # Auth gate with demo credentials
```

---

## Setup

```bash
cd frontend
npm install

# Optional: configure API URL (defaults to localhost:8000)
# Create frontend/.env:
VITE_API_URL=http://localhost:8000

npm run dev
# Runs at http://localhost:5173
```

### Available Scripts

```bash
npm run dev      # Start Vite dev server at http://localhost:5173
npm run build    # Production bundle → dist/
npm run preview  # Preview the production build locally
```

---

## Authentication

The app uses `sessionStorage` as an auth gate. Credentials are checked in `LoginPage.jsx` against hardcoded demo accounts:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `demo` | `demo123` | Viewer |
| `manager` | `manager123` | Manager |

Session stored as `sessionStorage.getItem("mantaray_user")` — a JSON object `{ username, role }`. On logout, `sessionStorage.removeItem("mantaray_user")` clears the session.

The `/enquiry` route bypasses the auth gate and renders `<EnquiryPage />` directly.

---

## Routing & Navigation

All navigation uses React Router v6 with **full-page routes** — no modal overlays.

| Route | Component | Auth | Description |
|---|---|---|---|
| `/` | `Dashboard.jsx` | ✅ | KPI overview, toast notifications, recent leads |
| `/leads` | `Leads.jsx` | ✅ | Lead table, search, filters, call buttons |
| `/leads/:id` | `LeadDetail.jsx` | ✅ | Full lead profile (read-only) |
| `/leads/:id/edit` | `LeadEdit.jsx` | ✅ | Edit lead fields (PATCH /api/leads/:id) |
| `/lead-generation` | `LeadGeneration.jsx` | ✅ | Live WebSocket enquiry feed |
| `/campaigns` | `Campaigns.jsx` | ✅ | Campaign performance |
| `/analytics` | `Analytics.jsx` | ✅ | Pipeline metrics, charts |
| `/call-logs` | `CallLogs.jsx` | ✅ | Call history, `?lead=` filter |
| `/call-logs/:call_id/edit` | `CallLogEdit.jsx` | ✅ | Edit call record |
| `/billing` | `Billing.jsx` | ✅ | Invoices, Razorpay |
| `/enquiry` | `EnquiryPage.jsx` | ❌ Public | Customer form |

### Navigation Flow

```
/leads table row click       → /leads/:id
/leads/:id "Update"          → /leads/:id/edit
/leads/:id/edit save         → navigate(-1) → /leads/:id
/leads/:id "Call Logs"       → /call-logs?lead=:id
/call-logs edit icon         → /call-logs/:call_id/edit
All back buttons             → navigate(-1) or explicit parent path
```

---

## API Helper (`App.jsx`)

All API calls use the shared helper:

```javascript
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}
```

Import in any page: `import { apiFetch, API_BASE } from '../App.jsx'`

---

## Layout Shell (`App.jsx`)

### Sidebar

Dark navy sidebar (`#0c1322`) with:
- Logo mark: Phone icon + "MantaRay AI" / "Škoda Auto India"
- Navigation items with Lucide icons and optional badges
- Agent status card: "Maya — AI Voice Agent · Online & Ready"
- Logout button (shows current username)

The sidebar is collapsible via the hamburger/X button in the TopBar.

### TopBar

Sticky header showing:
- Sidebar toggle button (Menu/X icon)
- Current page title + subtitle (from `PAGE_META` map)
- Current date/time (en-IN locale)
- Refresh button
- System Online indicator (green dot)

### EnquiryPage Exception

`/enquiry` renders standalone — no Sidebar, no TopBar. The `AppLayout` component checks `location.pathname === '/enquiry'` and returns `<EnquiryPage />` directly.

---

## Pages

### Dashboard (`/`)

- **KPI cards** — Total Leads, Hot Leads, Calls Today, Conversion Rate with trend indicators and mini bar charts
- **Pipeline funnel** — New → Contacted → Qualified → Closed with percentage labels
- **Recent leads table** — shows latest 6 leads with tag badges and inline Call button
- **LeadToast** — fixed top-right, WebSocket-driven, stackable notifications

**LeadToast component:**
```
Structure:
  1. Tri-color gradient accent bar (indigo → sky → emerald)
  2. "New Enquiry Received" header + dismiss button
  3. Lead card — initials avatar, name, phone, vehicle, location, tag badge
  4. Maya AI waveform strip — animated bars + "Maya AI — Automated Call in Progress"
  5. "View Lead" + "Call Logs" action buttons
  6. Auto-dismiss progress bar (9 seconds, depletes smoothly)

Animations:
  toastSlideIn — spring slide from right (cubic-bezier 0.34,1.56,0.64,1)
  bellPulse    — radial glow on icon (2 pulses on mount)
  waveBar      — staggered 5-bar oscillation (0.9s infinite, 0.1s stagger)
```

WebSocket connection to `/ws/crm`:
```javascript
ws = new WebSocket(`${API_BASE.replace('http', 'ws')}/ws/crm`)
ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'new_lead') addNotif(data)
}
// Keep-alive ping every 30s
```

### Leads (`/leads`)

- Search bar (filters by name, phone, email, vehicle, location)
- Tag filter buttons (All / Hot / Warm / Cold)
- Lead table: avatar, name, email, phone, vehicle, tag, status, Call button
- Row click navigates to `/leads/:id`
- Inline "Call" button → `POST /api/leads/:id/call`

### LeadDetail (`/leads/:id`)

Full-page read-only profile:
- Contact information (phone, email, source, language)
- Vehicle preferences (model, variant, budget, transmission, notes)
- CRM fields (tag, status, engagability, next action, follow-up date)
- Call history timeline
- AI Analysis section (populated post-call)
- Action buttons: "Call Now with Maya", "Update", "Call Logs"

### LeadEdit (`/leads/:id/edit`)

Form with all editable fields:
- Tag (Hot/Warm/Cold dropdown)
- Status dropdown
- Engagability dropdown
- Notes textarea
- Vehicle preferences (model, variant, budget, transmission)
- Next action, follow-up date

Submits `PATCH /api/leads/:id` then navigates back to `/leads/:id`.

### CallLogs (`/call-logs`)

- URL param `?lead=<id>` pre-filters logs by lead
- Columns: date, recipient, phone, duration, status, outcome, escalated
- Edit icon → `/call-logs/:call_id/edit`
- Shows transcript if available (expandable)

### CallLogEdit (`/call-logs/:call_id/edit`)

Edit form for:
- Call status dropdown (Completed / No Answer / Failed / Escalated)
- Outcome notes textarea
- Escalated toggle

Note: edits are front-end state only — there is no `PATCH /api/calls/logs/:id` endpoint. Changes are lost on page refresh.

### LeadGeneration (`/lead-generation`)

- Real-time WebSocket feed via `/ws/crm`
- Stat counters: Today's Enquiries, Total Leads, Hot Leads
- Live feed table prepends new leads as they arrive
- Existing leads loaded from `GET /api/leads` on mount

### Analytics (`/analytics`)

- Pipeline funnel with Recharts
- Tag distribution pie chart (Hot/Warm/Cold)
- Lead sources bar chart
- Key metrics: conversion rate, total calls, pipeline value, revenue

### Campaigns (`/campaigns`)

- Campaign performance table from `GET /api/campaigns`
- Columns: campaign name, total leads, hot leads

### Billing (`/billing`)

- Invoice table with status badges
- Cost estimator (per-call pricing calculator)
- Razorpay payment integration:
  1. Select invoice → `POST /api/billing/create-order`
  2. Razorpay checkout widget opens
  3. On success → `POST /api/billing/verify` (HMAC validation)
  4. Invoice marked as paid

### EnquiryPage (`/enquiry`) — Public

Standalone page (no sidebar/auth):
- Customer name, phone, email, source, language preference fields
- Vehicle preferences (model, variant, budget, transmission, location)
- Contact consent checkbox
- Submits `POST /api/leads`
- Shows confirmation on success (includes "call incoming" message if consent given)
- Handles re-enquiry response (returning customer detected)

### LoginPage

Standalone page shown when no session exists:
- Username + password form
- Demo credentials shown in footer
- On success: saves `{ username, role }` to sessionStorage
- Background: floating animated shapes (`float` keyframe)
- Footer: "© 2026 House of Mantaray · MantaRay AI"

---

## Design System (`index.css`)

Light/white enterprise theme with CSS custom properties.

### CSS Variables

```css
:root {
  /* Brand */
  --brand-primary:   #4f46e5;   /* Indigo — primary actions */
  --brand-secondary: #0ea5e9;   /* Sky blue — secondary */
  --brand-accent:    #059669;   /* Emerald — success, hot badge */

  /* Backgrounds */
  --bg-base:       #f8fafc;     /* Page background */
  --bg-surface:    #ffffff;     /* Cards */
  --bg-elevated:   #f1f5f9;     /* Elevated elements */

  /* Text */
  --text-primary:   #0f172a;    /* Headings */
  --text-secondary: #475569;    /* Body text */
  --text-muted:     #94a3b8;    /* Labels, hints */

  /* Sidebar (dark navy) */
  --sidebar-bg:     #0c1322;
  --sidebar-text:   #e2e8f0;
  --sidebar-active: #4f46e5;

  /* Borders */
  --border-subtle:  #e2e8f0;
  --border-medium:  #cbd5e1;

  /* Radius */
  --radius-sm:  6px;
  --radius-md:  10px;
  --radius-lg:  16px;
  --radius-xl:  24px;
}
```

### Tag / Badge Classes

```css
.badge-hot    { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.badge-warm   { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
.badge-cold   { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
.badge-new    { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
```

### CSS Animation Keyframes

| Keyframe | Used By | Description |
|---|---|---|
| `toastSlideIn` | LeadToast | Spring slide-in from right — `cubic-bezier(0.34,1.56,0.64,1)` |
| `bellPulse` | LeadToast phone icon | Radial glow pulse — 2 cycles on mount |
| `waveBar` | LeadToast waveform | Staggered height oscillation — 5 bars, 0.9s infinite |
| `fadeInUp` | Page mounts, LeadDetail | Translate Y + opacity fade |
| `float` | LoginPage shapes | Slow vertical float, infinite |
| `pulse` | System Online dot | Opacity pulse for live indicator |

---

## Dependencies

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.27.0",
  "recharts": "^2.13.3",
  "lucide-react": "^0.460.0",
  "xlsx": "^0.18.5"
}
```

| Package | Usage |
|---|---|
| `react-router-dom` | BrowserRouter, Routes, NavLink, useNavigate, useParams |
| `recharts` | Analytics page charts (BarChart, PieChart, AreaChart, etc.) |
| `lucide-react` | All icons throughout the UI (Phone, Users, BarChart3, etc.) |
| `xlsx` | CSV/Excel lead import (EnquiryPage bulk upload) |

---

## Docker Build (Nginx Production)

The frontend Dockerfile uses a multi-stage build:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
ARG VITE_API_URL=""   # empty in Docker — nginx proxies to backend
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

In Docker mode, `VITE_API_URL` is empty so `API_BASE` resolves to `""` (relative paths). The Nginx config proxies `/api/` and `/ws/` to `http://backend:8000` on the internal Docker network.

---

## Known Limitations

- **CallLogEdit is front-end only** — no backend PATCH endpoint for call logs; edits lost on refresh
- **sessionStorage auth** — no real auth; credentials are hardcoded; session expires on tab close
- **No role-based access control** — all three demo roles see the same UI
- **No optimistic updates** — API calls complete before UI updates
- **No error boundary** — uncaught promise rejections may leave the UI in a broken state
