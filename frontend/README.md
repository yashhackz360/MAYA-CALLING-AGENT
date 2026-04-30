# MantaRay AI — Frontend

React 18 + Vite frontend for the MantaRay AI calling agent. Provides the CRM dashboard, lead management pages, and the Call Console — the primary interface where Maya conducts AI-powered voice calls in real time.

---

## Architecture

```
frontend/src/
├── main.jsx                  # App entry point
├── App.jsx                   # Router + layout shell
├── index.css                 # Global design system (CSS variables, components)
│
├── pages/
│   ├── CallConsole.jsx       # AI call interface (TTS + STT + WebSocket + state machine)
│   ├── Dashboard.jsx         # CRM overview with charts
│   ├── Leads.jsx             # Lead list with search, filter, call buttons
│   ├── LeadGeneration.jsx    # CRM form dashboard + real-time WebSocket feed
│   ├── Campaigns.jsx         # Campaign tracking
│   ├── Analytics.jsx         # Metrics deep-dive
│   ├── CallLogs.jsx          # Full call history
│   └── Enquiry.jsx           # Public enquiry form (no sidebar, light theme)
│
└── components/
    ├── Layout.jsx             # Sidebar + topbar shell
    ├── Sidebar.jsx            # Collapsible navigation
    └── ...
```

---

## Setup

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

### Environment

```env
# frontend/.env
VITE_API_URL=http://localhost:8000   # FastAPI backend URL
```

---

## Call Console (`pages/CallConsole.jsx`)

The Call Console is the core feature. It manages the complete voice interaction lifecycle.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Topbar  [📞 Active Calls]  [Show/Hide Nav]  [Show/Hide Tx] │
├──────────────┬──────────────────────┬────────────────────────┤
│   COL 1      │       COL 2          │       COL 3            │
│  Lead List   │   Phone Mockup       │   Live Transcript      │
│              │   Voice Controls     │   Quick-Reply Chips    │
│              │   Status Bar         │   Call Summary         │
└──────────────┴──────────────────────┴────────────────────────┘
```

> Columns are collapsible independently. When a column is hidden, the remaining columns expand to fill the space (CSS Grid, no dead space).

---

## Voice Pipeline

### TTS — Text-to-Speech (`speak()` function)

| Setting | Value | Reason |
|---|---|---|
| `rate` | `0.88` | Measured Indian English cadence — not rushed |
| `pitch` | `1.05` | Grounded, professional tone |
| `lang` | `en-IN` | Indian English pronunciation |
| Voice | Cached female voice | Selected once at startup for consistency |

Flow:
```
Agent text received → speechSynthesis.speak(utt)
  → onend fires → setAgentSpeaking(false) → isProcessingRef.current = false
  → 1800ms cooldown timer starts
  → cooldown expires → (if autoListen ON) mic restarts
```

### STT — Speech Recognition (`useSpeechRecognition` hook)

| Setting | Value |
|---|---|
| `lang` | `en-IN` (Indian English recognition) |
| `continuous` | `false` (one utterance per turn) |
| `interimResults` | `true` (live text appears while speaking) |

Flow:
```
startListening() called
  → rec.onresult fires with interim text → shown in transcript bubble
  → final result fires → rec.abort() → onResult(finalText) called
  → handleSpeechResult() → isProcessingRef.current = true
  → sendInput(text) called → API/WebSocket request sent
```

---

## Auto-Listen & Guards

### 1.8s Post-TTS Cooldown
After Maya finishes speaking, the mic waits **1800ms** before starting. This prevents:
- STT picking up the tail-end of Maya's voice
- Ambient noise triggering a false customer turn
- Race conditions where the microphone fires before the customer is ready

```javascript
// useEffect fires when agentSpeaking flips false
setTimeout(() => {
  // Re-check all guards before starting mic
  if (!isActiveRef.current && autoListen && !agentSpeakingRef.current &&
      !isProcessingRef.current && !callEnded) {
    startListening()
  }
}, 1800)
```

### STT Noise Filter (min 2 words)
Auto-listen inputs shorter than 2 words AND 6 characters are discarded as noise. Manual button-click inputs always go through regardless of length.

```javascript
const isAutoInput = !text  // button clicks pass text explicitly
if (isAutoInput && inputText.split(' ').length < 2 && inputText.length < 6) {
  // Discard — STT noise
  isProcessingRef.current = false; return
}
```

### Processing Lock (`isProcessingRef`)
Shared ref that prevents any new input while the LLM is processing or Maya is speaking. Cleared only after Maya finishes the TTS utterance.

```
Customer speaks → isProcessingRef = true
  → LLM generates response → TTS speaks
  → TTS onend → isProcessingRef = false → mic can restart
```

### Barge-in
If the customer starts speaking while Maya is talking, `speechSynthesis.cancel()` is called immediately. Maya stops and the customer's speech is captured.

---

## Status Bar — 4 States

| State | Display | Colour |
|---|---|---|
| **Thinking** | 💭 Maya is thinking... | Purple (indigo) |
| **Speaking** | Maya is speaking... | Purple (indigo) |
| **Listening** | 🎙️ Listening... speak now | Green (auto) / Red (manual) |
| **Idle** | 🎤 Tap mic to speak | Grey |

---

## Stage-Aware Quick-Reply Suggestions

The suggestion chips at the bottom of the transcript panel update automatically based on conversation stage:

| Transcript turns | Label | Suggestions |
|---|---|---|
| 0–2 | 🎙️ Availability | "Yes I have time", "Sure go ahead", "I am busy right now" |
| 2–6 | 🏠 Property Type | "I am looking for a 2BHK", "Preferably in Whitefield", "3BHK would be ideal" |
| 6–12 | 💰 Budget & Details | "Budget 80 to 90 lakhs", "This is for self-use", "Home loan required" |
| 12+ | 📅 Next Steps | "Available Saturday morning", "Send brochure on WhatsApp", "Connect me to senior consultant" |

---

## State Management Pattern

All critical state uses **refs** (not useState) to avoid stale closure bugs in callbacks:

| Ref | Purpose |
|---|---|
| `callIdRef` | Always-current call ID in async callbacks |
| `isProcessingRef` | Processing lock — shared between STT, TTS, API |
| `agentSpeakingRef` | TTS state — used in STT restart guards |
| `isMutedRef` | Mute state — read in TTS speak callback |
| `callEndedRef` | Prevent inputs after call ends |

---

## Available Scripts

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production bundle (dist/)
npm run preview  # Preview production build locally
npm run lint     # ESLint check
```

---

## Design System

Variables defined in `index.css`:

```css
--brand-primary: #4f46e5       /* Indigo — primary actions */
--bg-base: #0f172a             /* Dark navy background */
--bg-surface: #1e293b          /* Card surfaces */
--bg-elevated: #263044         /* Elevated elements */
--text-primary: #f1f5f9        /* Primary text */
--text-secondary: #94a3b8      /* Secondary text */
--text-muted: #64748b          /* Muted labels */
--border-subtle: #2d3748       /* Borders */
--radius-md: 10px              /* Card radius */
--radius-lg: 16px              /* Modal radius */
```
