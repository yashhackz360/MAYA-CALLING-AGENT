import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX,
  User, MapPin, Home, Wallet, Clock, MessageSquare,
  ChevronRight, ChevronLeft, AlertTriangle, CheckCircle, Zap
} from 'lucide-react'
import { apiFetch } from '../App.jsx'

// ─── TTS: Single Consistent Female Voice (cached) ────────────────────────────

// Voice priority cascade — Indian English voices first for Indian customers
const VOICE_PRIORITY = [
  'Microsoft Neerja Online',        // Windows 11 — Indian English neural (BEST)
  'Microsoft Neerja',               // Windows 11 — Indian English
  'Google हिन्दी',                    // Chrome — Hindi (fallback)
  'Google UK English Female',       // Chrome — acceptable neutral
  'Veena',                          // macOS — Indian English
  'Microsoft Aria Online',          // Windows 11 — neutral neural
  'Microsoft Zira',                 // Windows — neutral female
  'Samantha',                       // macOS — neutral
  'Google US English',              // Chrome fallback
]

let _cachedVoice = null
let _voicesLoaded = false

// Load voices once (they load asynchronously in Chrome)
function _loadVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis?.getVoices() || []
    if (voices.length > 0) {
      _voicesLoaded = true
      resolve(voices)
      return
    }
    // Chrome loads voices async — wait for the event
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        _voicesLoaded = true
        resolve(window.speechSynthesis.getVoices())
      }
      // Timeout fallback
      setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1000)
    } else {
      resolve([])
    }
  })
}

async function _getSelectedVoice() {
  if (_cachedVoice) return _cachedVoice
  const voices = await _loadVoices()
  if (voices.length === 0) return null

  // Try priority list first
  for (const name of VOICE_PRIORITY) {
    const match = voices.find(v => v.name.includes(name))
    if (match) { _cachedVoice = match; return match }
  }
  // Fallback: any Indian or female-sounding English voice
  const indianVoice = voices.find(v =>
    v.lang === 'en-IN' || v.name.toLowerCase().includes('india')
  )
  if (indianVoice) { _cachedVoice = indianVoice; return indianVoice }
  const femaleVoice = voices.find(v =>
    v.lang.startsWith('en') && (
      v.name.toLowerCase().includes('female') ||
      v.name.toLowerCase().includes('woman') ||
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('neerja') ||
      v.name.toLowerCase().includes('veena')
    )
  )
  if (femaleVoice) { _cachedVoice = femaleVoice; return femaleVoice }
  // Last resort: first English voice
  const anyEnglish = voices.find(v => v.lang.startsWith('en'))
  _cachedVoice = anyEnglish || voices[0]
  return _cachedVoice
}

// Initialize voices early
if (typeof window !== 'undefined') _loadVoices()

// ─── xAI TTS: High-quality voice via API ──────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Track currently playing xAI audio so endCall can stop it immediately
let _currentXaiAudio = null

// Global audio controller — exposes queue so endCall can nuke everything
const _audioController = {
  queue: [],
  isPlaying: false,
  stopAll() {
    this.queue = []           // drain pending chunks
    this.isPlaying = false
    if (_currentXaiAudio) {
      try { _currentXaiAudio.pause(); _currentXaiAudio.src = '' } catch (_) {}
      _currentXaiAudio = null
    }
    window.speechSynthesis?.cancel()
  }
}

async function speakWithXaiTTS(text, onEnd) {
  try {
    const res = await fetch(`${API_BASE}/api/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'ara' }),
    })
    if (!res.ok) throw new Error(`TTS ${res.status}`)
    const data = await res.json()
    if (!data.audio) throw new Error('No audio in response')
    const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))
    const blob = new Blob([audioBytes], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    _currentXaiAudio = audio
    audio.onended = () => { URL.revokeObjectURL(url); _currentXaiAudio = null; onEnd?.() }
    audio.onerror = () => { URL.revokeObjectURL(url); _currentXaiAudio = null; onEnd?.() }
    // play() returns a Promise — must catch it or autoplay policy silently kills audio
    await audio.play().catch(err => {
      console.warn('[xAI TTS] play() rejected (autoplay policy?):', err.message)
      URL.revokeObjectURL(url)
      _currentXaiAudio = null
      throw err   // re-throw so outer catch falls back to browser TTS
    })
    return true
  } catch (e) {
    console.warn('[xAI TTS] Failed — falling back to browser TTS:', e.message)
    return false
  }
}

async function speak(text, onEnd) {
  // ── STRICT VOICE POLICY: ElevenLabs Tara ONLY ───────────────────────────────
  // Never fall back to browser SpeechSynthesis (unpredictable system voices).
  // If xAI TTS API fails, log it and unblock the mic via onEnd() — no voice change.
  const ok = await speakWithXaiTTS(text, onEnd)
  if (!ok) {
    console.error('[TTS] ElevenLabs/xAI TTS failed — mic unblocked, no voice fallback')
    onEnd?.()   // unblock mic so call doesn't freeze
  }
}

// ─── STT: Browser Web Speech (primary, instant) → Deepgram Nova-2 (fallback) ──
// Browser webkitSpeechRecognition gives instant results with zero network latency.
// Falls back to Deepgram Nova-2 batch (records audio → POST /api/stt) only if
// browser STT is unavailable. isActiveRef stays true during any active STT.

function useSpeechRecognition(onResult, onInterim, guards = {}) {
  const isActiveRef      = useRef(false)
  const mediaRecorderRef = useRef(null)
  const micStreamRef     = useRef(null)
  const audioContextRef  = useRef(null)
  const silenceTimerRef  = useRef(null)
  const chunksRef        = useRef([])
  const browserRecRef    = useRef(null)
  const onResultRef      = useRef(onResult)
  const onInterimRef     = useRef(onInterim)
  const { isProcessingRef, agentSpeakingRef } = guards

  // Always read latest callbacks — avoids stale closure issues
  onResultRef.current  = onResult
  onInterimRef.current = onInterim

  const SILENCE_THRESHOLD = 14    // RMS (0-255) below this = silence
  const SILENCE_DURATION  = 900   // ms — cut from 1500 for faster response
  const MIN_SPEECH_MS     = 250   // don't send if recording is too short

  // ── Internal cleanup (audio context + silence timer + mic stream) ──────────
  const _cleanup = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (audioContextRef.current) { try { audioContextRef.current.close() } catch (_) {}; audioContextRef.current = null }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
  }

  // ── POST recorded audio to backend → Deepgram Nova-2 → transcript ──────────
  // isActiveRef stays TRUE during fetch so auto-listen cannot restart mid-flight.
  const _sendToGroq = async (chunks, mimeType) => {
    if (!chunks.length) { isActiveRef.current = false; return }
    const blob = new Blob(chunks, { type: mimeType })
    if (blob.size < 800) { isActiveRef.current = false; return }  // too small — ambient noise

    const formData = new FormData()
    formData.append('audio', blob, 'audio.webm')

    try {
      const res = await fetch(`${API_BASE}/api/stt`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`STT ${res.status}`)
      const { text } = await res.json()
      if (text?.trim()) {
        onInterimRef.current?.('')
        isActiveRef.current = false   // release BEFORE calling onResult
        onResultRef.current(text.trim())
      } else {
        isActiveRef.current = false   // empty — release lock
      }
    } catch (e) {
      console.warn('[Groq STT] Error:', e)
      isActiveRef.current = false
    }
  }

  // ── Groq Whisper implementation ────────────────────────────────────────────
  const startGroqWhisper = useCallback(async () => {
    if (isProcessingRef?.current || agentSpeakingRef?.current) return false
    if (isActiveRef.current) return true

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      isActiveRef.current = true

      // AudioContext silence detector
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100)  // collect a chunk every 100ms
      console.log('[Deepgram STT] Mic open — recording')

      const dataArray    = new Uint8Array(analyser.frequencyBinCount)
      let silenceStart   = null
      const recordingStart = Date.now()

      const checkSilence = () => {
        if (!isActiveRef.current) return
        analyser.getByteFrequencyData(dataArray)
        const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length)

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now()
          const elapsed = Date.now() - recordingStart
          if ((Date.now() - silenceStart) >= SILENCE_DURATION && elapsed >= MIN_SPEECH_MS) {
            // Silence long enough — stop recording and send to Groq
            _cleanup()
            const rec = mediaRecorderRef.current
            mediaRecorderRef.current = null
            if (rec && rec.state !== 'inactive') {
              rec.onstop = () => _sendToGroq(chunksRef.current.splice(0), rec.mimeType)
              try { rec.stop() } catch (_) {}
            } else {
              isActiveRef.current = false
            }
            return  // don't schedule next checkSilence tick
          }
        } else {
          silenceStart = null  // reset silence window when speech detected
        }
        silenceTimerRef.current = setTimeout(checkSilence, 50)
      }
      checkSilence()
      return true
    } catch (e) {
      console.warn('[Groq STT] Failed to start:', e)
      isActiveRef.current = false
      return false
    }
  }, [isProcessingRef, agentSpeakingRef])

  const stopGroqWhisper = useCallback(() => {
    isActiveRef.current = false
    _cleanup()
    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null
    chunksRef.current = []
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop() } catch (_) {} }
  }, [])

  // ── Browser Web Speech fallback ────────────────────────────────────────────
  const startBrowser = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return false
    if (isProcessingRef?.current || agentSpeakingRef?.current) return false
    if (browserRecRef.current) { try { browserRecRef.current.abort() } catch (_) {} }

    const rec = new SR()
    rec.lang = 'en-IN'  // Indian English — fast and accurate for our use case
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1

    let finalFired = false
    rec.onresult = e => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      if (interim) onInterimRef.current?.(interim)
      if (final && !finalFired) {
        finalFired = true
        onInterimRef.current?.('')
        isActiveRef.current = false
        try { rec.abort() } catch (_) {}
        browserRecRef.current = null
        onResultRef.current(final)
      }
    }
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.warn('[Browser STT]', e.error)
      isActiveRef.current = false
    }
    rec.onend = () => {
      if (isActiveRef.current && !isProcessingRef?.current && !agentSpeakingRef?.current) {
        setTimeout(() => {
          if (isActiveRef.current && !isProcessingRef?.current && !agentSpeakingRef?.current) {
            try { rec.start() } catch (_) {}
          }
        }, 250)
      }
    }
    try {
      rec.start()
      browserRecRef.current = rec
      isActiveRef.current = true
      return true
    } catch (e) {
      console.warn('[Browser STT] Failed:', e)
      return false
    }
  }, [isProcessingRef, agentSpeakingRef])

  const stopBrowser = useCallback(() => {
    isActiveRef.current = false
    if (browserRecRef.current) { try { browserRecRef.current.abort() } catch (_) {}; browserRecRef.current = null }
  }, [])

  // ── Unified interface — Browser STT first (instant), xAI batch fallback ──
  const start = useCallback(() => {
    if (isProcessingRef?.current || agentSpeakingRef?.current) return false
    // Browser STT = instant (no network). Use it as primary.
    const browserOk = startBrowser()
    if (browserOk) return true
    // Fallback to xAI batch STT only if browser STT unavailable
    console.warn('[STT] Browser STT unavailable — falling back to xAI grok-stt')
    startGroqWhisper().catch(() => {})
    return true
  }, [startGroqWhisper, startBrowser, isProcessingRef, agentSpeakingRef])

  const stop = useCallback(() => {
    stopGroqWhisper()
    stopBrowser()
  }, [stopGroqWhisper, stopBrowser])

  return { start, stop, isActiveRef }
}

// ─── Timer Hook ───────────────────────────────────────────────────────────────
function useCallTimer(running) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// ─── DTMF Key Map ─────────────────────────────────────────────────────────────
const DTMF_KEYS = [
  ['1', 'ABC'], ['2', 'DEF'], ['3', 'GHI'],
  ['4', 'JKL'], ['5', 'MNO'], ['6', 'PQR'],
  ['7', 'STU'], ['8', 'VWX'], ['9', 'YZ'],
  ['*', ''], ['0', '+'], ['#', '']
]

const OPTION_LABELS = {
  '1': 'Book Test Drive',
  '2': 'Get Brochure & Pricing',
  '3': 'Service Appointment',
  '4': 'Finance Options',
  '0': 'Connect to Support',
}

// ─── Call Status Colors ───────────────────────────────────────────────────────
const STATUS_CONFIG = {
  idle: { label: 'Select a Lead', color: 'var(--text-muted)', anim: false },
  dialing: { label: 'Dialing...', color: '#f59e0b', anim: true },
  ringing: { label: 'Ringing', color: '#f59e0b', anim: true },
  connected: { label: 'Connected', color: '#10b981', anim: true },
  escalated: { label: 'Escalating to Human', color: '#ef4444', anim: false },
  ended: { label: 'Call Ended', color: 'var(--text-muted)', anim: false },
}

// ─── Main CallConsole ──────────────────────────────────────────────────────────
export default function CallConsole({ onActiveCallsChange }) {
  const { leadId } = useParams()
  const navigate = useNavigate()

  // State
  const [leads, setLeads] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [callStatus, setCallStatus] = useState('idle')
  const [callId, setCallId] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [agentText, setAgentText] = useState('')
  const [options, setOptions] = useState(null)
  const [userInput, setUserInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isEscalated, setIsEscalated] = useState(false)
  const [showEscalationModal, setShowEscalationModal] = useState(false)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [callEnded, setCallEnded] = useState(false)
  const [customPhone, setCustomPhone] = useState('')
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [autoListen, setAutoListen] = useState(true)
  const [interimText, setInterimText] = useState('')
  const [showTranscript, setShowTranscript] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [newLeadBanner, setNewLeadBanner] = useState(null) // { lead, countdown }

  // ── CRM WebSocket — Auto-call on new enquiry ──────────────────────────────
  // When a new lead is submitted via the enquiry form, the backend broadcasts
  // it over ws/crm. After 10s, show an approval popup to the admin.
  const crmWsRef = useRef(null)
  const initiateCallRef = useRef(null) // will be set later
  const [pendingCallLead, setPendingCallLead] = useState(null) // approval popup

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/crm'
    let ws
    try {
      ws = new WebSocket(wsUrl)
      crmWsRef.current = ws

      ws.onopen = () => {
        console.log('[CRM WS] Connected — watching for new enquiries')
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25000)
        ws._pingInterval = ping
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'new_lead' && data.lead) {
          const lead = data.lead
          console.log('[CRM WS] 🔔 New enquiry received:', lead.name)

          // Show notification banner immediately
          setNewLeadBanner({ lead, message: data.message })

          // Refresh leads list
          apiFetch('/api/leads').then(d => setLeads(d.leads || [])).catch(() => {})

          // After 10 seconds, show approval popup (not auto-call)
          setTimeout(() => {
            setNewLeadBanner(null) // dismiss notification
            setPendingCallLead(lead) // show approval popup
            console.log('[CRM WS] Showing approval popup for:', lead.name)
          }, 10000)
        }
      }

      ws.onerror = () => console.warn('[CRM WS] Connection error')
      ws.onclose = () => {
        if (ws._pingInterval) clearInterval(ws._pingInterval)
        console.log('[CRM WS] Disconnected')
      }
    } catch (e) {
      console.warn('[CRM WS] Failed to connect:', e)
    }

    return () => {
      if (ws) {
        if (ws._pingInterval) clearInterval(ws._pingInterval)
        ws.close()
      }
    }
  }, []) // Mount once

  const handleApproveCall = () => {
    const lead = pendingCallLead
    setPendingCallLead(null)
    if (lead && initiateCallRef.current) {
      console.log('[CRM WS] ✅ Admin approved — calling:', lead.name)
      setSelectedLead(lead)
      initiateCallRef.current(lead)
    }
  }

  const handleRejectCall = () => {
    console.log('[CRM WS] ❌ Admin rejected call for:', pendingCallLead?.name)
    setPendingCallLead(null)
  }

  const wsRef = useRef(null)
  const transcriptRef = useRef(null)
  // ── Stable refs (always current, no stale-closure issues) ─────────────────
  const callIdRef       = useRef(null)
  const callEndedRef    = useRef(false)
  const isMutedRef      = useRef(false)
  const sendInputRef    = useRef(null)
  const isProcessingRef = useRef(false)   // true while waiting for LLM response
  const agentSpeakingRef = useRef(false)  // true while Maya is speaking

  // Sync on every render — O(1), no effect overhead
  callIdRef.current       = callId
  callEndedRef.current    = callEnded
  isMutedRef.current      = isMuted
  agentSpeakingRef.current = agentSpeaking

  const timerActive = callStatus === 'connected'
  const callTimer = useCallTimer(timerActive)

  // Load leads
  useEffect(() => {
    apiFetch('/api/leads').then(d => {
      const ls = d.leads || []
      setLeads(ls)
      if (leadId) {
        const found = ls.find(l => l.lead_id === leadId)
        if (found) setSelectedLead(found)
      }
    }).catch(() => {})
  }, [leadId])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // Speech recognition — uses refs to avoid ALL stale closure issues
  const handleSpeechResult = useCallback((text) => {
    if (!text?.trim()) return
    if (isProcessingRef.current) {
      console.debug('[STT] Ignoring result — already processing')
      return
    }
    setInterimText('')
    setUserInput(text)
    // Barge-in: cancel Maya if she's speaking (both browser TTS and xAI audio)
    window.speechSynthesis.cancel()
    if (_currentXaiAudio) { _currentXaiAudio.pause(); _currentXaiAudio = null }
    setAgentSpeaking(false)
    // Block further input until LLM responds
    isProcessingRef.current = true
    setIsListening(false)
    // Send immediately (no setTimeout — mic already stopped in STT hook)
    if (sendInputRef.current) sendInputRef.current(text)
  }, [isProcessingRef]) // isProcessingRef is stable — no re-creation needed

  const handleInterim = useCallback((text) => {
    setInterimText(text)
    // Barge-in: if customer starts speaking while Maya talks, stop her
    if (text && agentSpeaking) {
      window.speechSynthesis.cancel()
      if (_currentXaiAudio) { _currentXaiAudio.pause(); _currentXaiAudio = null }
      setAgentSpeaking(false)
    }
  }, [agentSpeaking])

  const { start: startListening, stop: stopListening, isActiveRef } = useSpeechRecognition(
    handleSpeechResult,
    handleInterim,
    { isProcessingRef, agentSpeakingRef }  // guards — mic stops when processing/speaking
  )

  // Auto-listen: start mic after Maya finishes. 1800ms cooldown prevents
  // STT from picking up ambient noise right after Maya stops talking.
  useEffect(() => {
    if (agentSpeaking || isProcessingRef.current) return
    if (!autoListen || callStatus !== 'connected' || callEnded) return
    const t = setTimeout(() => {
      if (!isActiveRef.current && autoListen && !agentSpeakingRef.current &&
          !isProcessingRef.current && !callEnded) {
        const ok = startListening()
        if (ok) setIsListening(true)
      }
    }, 200)   // 200ms — minimal cooldown for fastest response
    return () => clearTimeout(t)
  }, [agentSpeaking, autoListen, callStatus, callEnded])

  // ── Initiate Call ────────────────────────────────────────────────────────────
  const initiateCall = async (lead) => {
    if (!lead) return

    // ── AUTOPLAY UNLOCK ────────────────────────────────────────────────────────
    // Browser autoplay policy blocks audio.play() after an async gap (await).
    // Play a silent 1-sample audio RIGHT HERE while still inside the user-gesture
    // (button click) synchronous call stack. This permanently unlocks audio for
    // this page session — all subsequent audio.play() calls will succeed.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
      await ctx.resume()
    } catch (_) {}
    // ──────────────────────────────────────────────────────────────────────────

    setSelectedLead(lead)
    setCallStatus('dialing')
    setTranscript([])
    setOptions(null)
    setIsEscalated(false)
    setCallEnded(false)
    callEndedRef.current = false
    setShowEscalationModal(false)

    // Brief dialing simulation (minimal — don't waste time)
    await new Promise(r => setTimeout(r, 500))
    setCallStatus('ringing')
    await new Promise(r => setTimeout(r, 700))
    setCallStatus('connected')
    onActiveCallsChange?.(1)

    try {
      const res = await apiFetch('/api/calls/initiate', {
        method: 'POST',
        body: JSON.stringify({ lead_id: lead.lead_id })
      })

      setCallId(res.call_id)

      // Add opening message to transcript
      const openingMsg = {
        speaker: 'agent',
        text: res.opening_message,
        timestamp: new Date().toISOString()
      }
      setTranscript([openingMsg])
      setAgentText(res.opening_message)

      // Speak the opening message
      if (!isMuted) {
        setAgentSpeaking(true)
        speak(res.opening_message, () => {
          setAgentSpeaking(false)
          isProcessingRef.current = false
          // Immediately start mic — don't wait for useEffect timer
          setTimeout(() => {
            if (!callEndedRef.current) {
              const ok = startListening()
              if (ok) setIsListening(true)
              console.log('[initiateCall] Mic started immediately after opening')
            }
          }, 200) // 200ms — just enough for audio context to settle
        })
      }

    // Connect streaming WebSocket (sentence-by-sentence audio)
      connectStreamingWebSocket(res.call_id)
    } catch (err) {
      console.error('Failed to initiate call:', err)
      setCallStatus('ended')
      onActiveCallsChange?.(0)
    }
  }

  // Keep ref current for CRM WS auto-call
  initiateCallRef.current = initiateCall

  // ── WebSocket (legacy — non-streaming fallback) ─────────────────────────────
  const connectWebSocket = (cid) => {
    // Dynamic WS URL: works locally (localhost:8000) and in Docker (nginx proxy)
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    let wsUrl
    if (apiBase) {
      wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/call/${cid}`
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${wsProtocol}//${window.location.host}/ws/call/${cid}`
    }
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'agent_turn') {
        const agentText = data.agent_text
        if (!agentText) { isProcessingRef.current = false; setAgentSpeaking(false); return }

        setTranscript(prev => [...prev, { speaker: 'agent', text: agentText, timestamp: new Date().toISOString() }])
        setAgentText(agentText)
        if (data.options) setOptions(data.options); else setOptions(null)

        setInterimText('')

        if (!isMutedRef.current) {
          speak(agentText, () => {
            setAgentSpeaking(false)
            isProcessingRef.current = false
            console.log('[WS] Maya done speaking — mic unlocked')
          })
        } else {
          setAgentSpeaking(false)
          isProcessingRef.current = false
        }

        if (data.escalated) {
          setIsEscalated(true)
          setShowEscalationModal(true)
          setTimeout(() => { setShowEscalationModal(false); setCallStatus('escalated') }, 4000)
        }
        if (data.call_ended) setTimeout(() => endCall(true), 8000)
      }

      if (data.type === 'call_ended') endCall()
    }

    ws.onerror = (e) => console.error('WS error:', e)
    ws.onclose = () => console.log('WS closed')
  }

  // ── Streaming WebSocket — sentence-by-sentence audio delivery ────────────────
  // This is the primary connection method for low-latency conversations.
  // Each agent response arrives as multiple audio_chunk messages,
  // allowing playback to start while remaining sentences are still generating.
  const connectStreamingWebSocket = (cid) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    let wsUrl
    if (apiBase) {
      wsUrl = apiBase.replace(/^http/, 'ws') + `/ws/call-stream/${cid}`
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${wsProtocol}//${window.location.host}/ws/call-stream/${cid}`
    }
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    // Audio queue for sentence-by-sentence playback
    // Also wired into _audioController so endCall() can stop everything immediately
    _audioController.queue = []
    _audioController.isPlaying = false

    const playNextInQueue = () => {
      if (_audioController.queue.length === 0) {
        _audioController.isPlaying = false
        // All chunks played — unlock mic
        setAgentSpeaking(false)
        isProcessingRef.current = false
        _currentXaiAudio = null
        console.log('[WS-Stream] All audio chunks played — mic unlocked')
        return
      }
      _audioController.isPlaying = true
      const { audioB64, isLast } = _audioController.queue.shift()
      try {
        const audioBytes = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0))
        const blob = new Blob([audioBytes], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        _currentXaiAudio = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          _currentXaiAudio = null
          if (isLast && callEndedRef.current) {
            endCall(true)
            return
          }
          playNextInQueue()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          _currentXaiAudio = null
          playNextInQueue()
        }
        audio.play().catch(() => {
          console.warn('[WS-Stream] play() failed — skipping chunk')
          _currentXaiAudio = null
          playNextInQueue()
        })
      } catch (e) {
        console.warn('[WS-Stream] Audio decode error:', e)
        playNextInQueue()
      }
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      // Individual sentence audio chunk — queue for immediate playback
      if (data.type === 'agent_audio_chunk') {
        setAgentSpeaking(true)
        // Show the first chunk's text in transcript immediately
        if (data.chunk_index === 0) {
          setInterimText('')
          // We'll add full transcript on agent_turn_complete
        }
        if (data.audio && !isMutedRef.current) {
          _audioController.queue.push({ audioB64: data.audio, isLast: data.is_last })
          if (!_audioController.isPlaying) playNextInQueue()
        } else if (!data.audio && data.is_last && callEndedRef.current) {
          // No audio but call should end — trigger cleanup
          endCall(true)
        }
        return
      }

      // Full turn complete — add to transcript, handle state transitions
      if (data.type === 'agent_turn_complete') {
        const fullText = data.full_text
        if (fullText) {
          setTranscript(prev => [...prev, { speaker: 'agent', text: fullText, timestamp: new Date().toISOString() }])
          setAgentText(fullText)
        }
        setOptions(null)

        // Unlock if muted OR if no audio was queued (TTS failed / audio=null from backend)
        if (isMutedRef.current || (!_audioController.isPlaying && _audioController.queue.length === 0)) {
          setAgentSpeaking(false)
          isProcessingRef.current = false
        }
        // Otherwise playNextInQueue unlocks when the last chunk finishes

        if (data.escalated) {
          setIsEscalated(true)
          setShowEscalationModal(true)
          setTimeout(() => { setShowEscalationModal(false); setCallStatus('escalated') }, 4000)
        }
        // Auto-end: mark callEnded flag so playNextInQueue auto-ends after last audio chunk
        if (data.call_ended) {
          setCallEnded(true)         // flag — playNextInQueue will call endCall(true) on last chunk
          callEndedRef.current = true
          // If muted or no audio at all, end immediately
          if (isMutedRef.current || (!_audioController.isPlaying && _audioController.queue.length === 0)) {
            endCall(true)
          }
        }
        return
      }

      if (data.type === 'call_ended') endCall()
    }

    ws.onerror = (e) => {
      console.error('[WS-Stream] Error — falling back to legacy WS:', e)
      // Fall back to non-streaming WebSocket
      connectWebSocket(cid)
    }
    ws.onclose = () => console.log('[WS-Stream] Closed')
  }

  // ── Send Input ─────────────────────────────────────────────────────────────
  // All values read from refs (never stale closures).
  // isProcessingRef stays TRUE from the moment we send until Maya finishes speaking.
  // This single flag gates: STT restart, auto-listen, new sends, double-fire.
  const sendInput = async (text) => {
    const inputText = (text || userInput || '').trim()
    const currentCallId = callIdRef.current
    const isEnded = callEndedRef.current
    const muted = isMutedRef.current

    if (!inputText) { isProcessingRef.current = false; return }
    if (!currentCallId) {
      console.warn('[sendInput] No callId — call not started yet')
      isProcessingRef.current = false; return
    }
    if (isEnded) { isProcessingRef.current = false; return }
    // STT noise filter: button clicks pass `text` explicitly;
    // auto-listen inputs must be at least 2 words to avoid sending STT noise.
    const isAutoInput = !text
    if (isAutoInput && inputText.split(' ').length < 2 && inputText.length < 6) {
      console.debug('[sendInput] Ignoring short STT noise:', inputText)
      isProcessingRef.current = false; return
    }

    console.log(`[sendInput] "${inputText}" | callId: ${currentCallId}`)

    // Show customer message in transcript
    setTranscript(prev => [...prev, { speaker: 'customer', text: inputText, timestamp: new Date().toISOString() }])
    setUserInput('')
    setOptions(null)
    window.speechSynthesis.cancel()

    // Show "Maya is thinking..." in status bar while LLM processes
    setAgentSpeaking(true)

    // Helper: called once we have the agent response
    const handleResponse = (data) => {
      const agentText = data.agent_text
      if (!agentText) { isProcessingRef.current = false; setAgentSpeaking(false); return }

      setTranscript(prev => [...prev, { speaker: 'agent', text: agentText, timestamp: new Date().toISOString() }])
      setAgentText(agentText)
      if (data.options) setOptions(data.options); else setOptions(null)

      if (data.escalated) {
        setIsEscalated(true)
        setShowEscalationModal(true)
        setTimeout(() => { setShowEscalationModal(false); setCallStatus('escalated') }, 4000)
      }

      if (!muted) {
        // isProcessingRef stays true until Maya finishes speaking
        speak(agentText, () => {
          setAgentSpeaking(false)
          isProcessingRef.current = false
          // Auto-end after last message finishes playing
          if (callEndedRef.current) { endCall(true); return }
          console.log('[sendInput] Maya done speaking — mic unlocked')
        })
      } else {
        setAgentSpeaking(false)
        isProcessingRef.current = false
        if (callEndedRef.current) endCall(true)
      }

      if (data.call_ended) {
        callEndedRef.current = true   // flag — speak() onEnd will call endCall(true)
      }
    }

    // Send via WebSocket (preferred) or REST fallback
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[sendInput] → WebSocket')
      wsRef.current.send(JSON.stringify({ type: 'input', text: inputText, call_id: currentCallId }))
      // Response handled in WS onmessage handler
    } else {
      console.log('[sendInput] → REST /api/calls/turn')
      try {
        const data = await apiFetch('/api/calls/turn', {
          method: 'POST',
          body: JSON.stringify({ call_id: currentCallId, user_input: inputText })
        })
        handleResponse(data)
      } catch (e) {
        console.error('[sendInput] API error:', e)
        // Show error in transcript + unlock
        setTranscript(prev => [...prev, {
          speaker: 'agent',
          text: "I'm sorry, I had a connection issue. Could you please repeat that?",
          timestamp: new Date().toISOString()
        }])
        setAgentSpeaking(false)
        isProcessingRef.current = false
      }
    }
  }

  // Always keep sendInputRef pointing to the latest sendInput closure
  sendInputRef.current = sendInput


  // ── End Call ──────────────────────────────────────────────────────────────────
  const endCall = async (waitForAudio = false) => {
    // IMMEDIATE audio kill unless called from within the audio player (last chunk just finished)
    if (!waitForAudio) {
      _audioController.stopAll()   // drains queue + stops current Audio + cancels browser TTS
    }
    setCallStatus('ended')
    setCallEnded(true)
    callEndedRef.current = true
    setAgentSpeaking(false)
    isProcessingRef.current = false
    setIsListening(false)
    onActiveCallsChange?.(0)

    if (wsRef.current) {
      try { wsRef.current.close() } catch (e) {}
      wsRef.current = null
    }

    if (callId) {
      try { await apiFetch(`/api/calls/${callId}/end`, { method: 'POST' }) } catch (e) {}
    }
  }

  // ── DTMF Press ────────────────────────────────────────────────────────────────
  const handleDTMF = (key) => {
    if (callStatus !== 'connected') return
    // Play a soft click feedback
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 440 + parseInt(key || 0) * 50
      gain.gain.value = 0.05
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    } catch (e) {}

    if (key === '#' || key === '*') return
    const label = OPTION_LABELS[key] || key
    sendInput(label || key)
  }

  const statusCfg = STATUS_CONFIG[callStatus] || STATUS_CONFIG.idle

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fadeInUp">

      {/* ── New Enquiry Auto-Call Banner ─────────────────────────────────────── */}
      {newLeadBanner && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          border: '2px solid #4ba82e',
          borderRadius: 16, padding: '16px 24px',
          boxShadow: '0 8px 32px rgba(75, 168, 46, 0.25)',
          display: 'flex', alignItems: 'center', gap: 14,
          animation: 'fadeInUp 0.4s ease',
          maxWidth: 420,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4ba82e, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff', flexShrink: 0,
            animation: 'pulse-slow 1.5s infinite',
          }}>📞</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 2 }}>
              🔔 New Enquiry Received!
            </div>
            <div style={{ fontSize: 12, color: '#047857', fontWeight: 500 }}>
              {newLeadBanner.lead.name}
              {newLeadBanner.lead.preferences?.vehicle_model &&
                ` · ${newLeadBanner.lead.preferences.vehicle_model}`}
            </div>
            <div style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: 600 }}>
              Preparing call — requesting approval...
            </div>
          </div>
          <button
            onClick={() => setNewLeadBanner(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, color: '#6b7280', padding: 4,
            }}
          >✕</button>
        </div>
      )}

      {/* ── New Lead Approval Popup ───────────────────────────────────────────── */}
      {pendingCallLead && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          animation: 'fadeInUp 0.3s ease',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '32px 36px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            maxWidth: 440, width: '90%', textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #4ba82e, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, color: '#fff',
              animation: 'pulse-slow 1.5s infinite',
            }}>📞</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 6 }}>
              New Lead Enquiry
            </h3>
            <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 4 }}>
              {pendingCallLead.name}
              {pendingCallLead.phone && ` · ${pendingCallLead.phone}`}
            </p>
            {pendingCallLead.preferences?.vehicle_model && (
              <p style={{ fontSize: 13, color: '#059669', fontWeight: 600, marginBottom: 4 }}>
                {pendingCallLead.preferences.vehicle_model}
                {pendingCallLead.preferences.enquiry_type && ` — ${pendingCallLead.preferences.enquiry_type}`}
              </p>
            )}
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
              Requesting approval to proceed with calling
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleApproveCall}
                style={{
                  padding: '12px 32px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #4ba82e, #3d8c24)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(75, 168, 46, 0.3)',
                  fontFamily: 'inherit',
                }}
              >✓ Yes, Proceed</button>
              <button
                onClick={handleRejectCall}
                style={{
                  padding: '12px 32px', borderRadius: 12,
                  border: '1.5px solid #e5e7eb', background: '#fff',
                  color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >✕ No, Skip</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Escalation Modal — Human Support Popup ────────────────────────── */}
      {showEscalationModal && (
        <div className="escalation-overlay">
          <div className="escalation-modal escalation-modal--rich">

            {/* Live indicator bar */}
            <div className="escalation-live-bar">
              <span className="escalation-live-dot" />
              <span>LIVE ESCALATION</span>
            </div>

            {/* Icon + heading */}
            <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍💼</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: 'var(--text-primary)' }}>
              Connecting to Human Executive
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Customer requested human support. Transferring to senior care executive.
            </p>

            {/* Animated steps */}
            <div className="escalation-steps">
              {[
                { icon: '📋', label: 'Notifying support team', delay: '0s' },
                { icon: '📡', label: 'Connecting executive line', delay: '0.6s' },
                { icon: '🤝', label: 'Human agent joining now', delay: '1.2s' },
              ].map((s, i) => (
                <div key={i} className="escalation-step" style={{ animationDelay: s.delay }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span className="escalation-step-tick">✓</span>
                </div>
              ))}
            </div>

            {/* Lead summary card */}
            {selectedLead && (
              <div className="escalation-lead-card">
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 8 }}>
                  LEAD HANDOFF SUMMARY
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Name</span>
                  <span style={{ fontWeight: 600 }}>{selectedLead.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Phone</span>
                  <span style={{ fontWeight: 600 }}>{selectedLead.phone}</span>
                  {selectedLead.preferences?.vehicle_model && <>
                    <span style={{ color: 'var(--text-muted)' }}>Interest</span>
                    <span style={{ fontWeight: 600 }}>{selectedLead.preferences.vehicle_model}</span>
                  </>}
                  {selectedLead.preferences?.location && <>
                    <span style={{ color: 'var(--text-muted)' }}>City</span>
                    <span style={{ fontWeight: 600 }}>{selectedLead.preferences.location}</span>
                  </>}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                className="escalation-btn-confirm"
                onClick={() => { setShowEscalationModal(false); setCallStatus('escalated') }}
              >
                ✓ Confirm Handoff
              </button>
              <button
                className="escalation-btn-cancel"
                onClick={() => setShowEscalationModal(false)}
              >
                Resume AI Call
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Main Layout: morphs 3→2 cols when transcript hidden ──────────────── */}
      <div
        className="call-console-wrapper"
        style={{
          gridTemplateColumns: showRightPanel
            ? '260px minmax(340px, 420px) 1fr'   /* 3 cols: leads | phone | transcript */
            : '260px 1fr',                        /* 2 cols: leads | phone fills rest  */
          transition: 'grid-template-columns 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >

        {/* ══ COL 1: Lead Selector ═════════════════════════════════════════════ */}
        <div className="lead-selector-col">

          {/* Header */}
          <div style={{
            padding: '12px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Leads</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{leads.length} contacts</div>
            </div>
            <button
              id="custom-phone-btn"
              className="topbar-btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setShowPhoneInput(!showPhoneInput)}
            >
              + Custom
            </button>
          </div>

          {/* Custom phone input */}
          {showPhoneInput && (
            <div className="card animate-fadeIn">
              <div className="card-body" style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Custom Number
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="custom-phone-input"
                    className="form-input"
                    style={{ fontSize: 12, padding: '8px 10px' }}
                    placeholder="+91 98765 43210"
                    value={customPhone}
                    onChange={e => setCustomPhone(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customPhone) {
                        const demoLead = {
                          lead_id: 'demo_custom', name: 'Demo Customer', phone: customPhone,
                          email: 'demo@example.com', source: 'Demo',
                          preferences: { location: 'Bangalore', vehicle_model: 'Škoda Kushaq',
                            variant: 'Style', budget: '₹15–18 Lakhs', enquiry_type: 'New Purchase', notes: 'Demo call' }
                        }
                        initiateCall(demoLead)
                      }
                    }}
                  />
                  <button
                    className="topbar-btn btn-primary"
                    style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                    onClick={() => {
                      if (customPhone) {
                        const demoLead = {
                          lead_id: 'demo_custom', name: 'Demo Customer', phone: customPhone,
                          email: 'demo@example.com', source: 'Demo',
                          preferences: { location: 'Bangalore', vehicle_model: 'Škoda Kushaq',
                            variant: 'Style', budget: '₹15–18 Lakhs', enquiry_type: 'New Purchase', notes: 'Demo call' }
                        }
                        initiateCall(demoLead)
                      }
                    }}
                  >
                    <Phone size={11} /> Call
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lead list */}
          {leads.map(lead => (
            <div
              key={lead.lead_id}
              id={`select-lead-${lead.lead_id}`}
              className={`lead-row-card${selectedLead?.lead_id === lead.lead_id ? ' selected' : ''}`}
              onClick={() => initiateCall(lead)}
              style={{
                outline: selectedLead?.lead_id === lead.lead_id
                  ? '2px solid var(--brand-primary)' : 'none',
              }}
            >
              <div className="lead-avatar" style={{ width: 38, height: 38, fontSize: 13 }}>
                {lead.name[0]}{lead.name.split(' ')[1]?.[0] || ''}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                    {lead.name}
                  </span>
                  {/* Cut Call — only for the active lead */}
                  {selectedLead?.lead_id === lead.lead_id && ['connected', 'dialing', 'ringing'].includes(callStatus) && (
                    <button
                      title="Cut call"
                      onClick={e => { e.stopPropagation(); endCall() }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: '#dc2626', border: 'none', cursor: 'pointer',
                        boxShadow: '0 0 0 3px rgba(220,38,38,0.25)',
                      }}
                    >
                      <PhoneOff size={11} color="#fff" />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.preferences?.vehicle_model}
                  </span>
                  {lead.preferred_language && (() => {
                    const cfg = {
                      english:  { label: '🌐', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)',  color: '#a5b4fc' },
                      hindi:    { label: '🇮🇳', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)',  color: '#fb923c' },
                      hinglish: { label: '🔀', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)',  color: '#4ade80' },
                    }[lead.preferred_language]
                    return cfg ? (
                      <span style={{
                        padding: '1px 5px', borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0,
                        background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                      }}>{cfg.label}</span>
                    ) : null
                  })()}
                </div>
              </div>
              <span className={`badge badge-${lead.tag?.toLowerCase()}`} style={{ flexShrink: 0 }}>
                {lead.tag}
              </span>
            </div>
          ))}

          {leads.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              No leads available
            </div>
          )}
        </div>

        {/* ══ COL 2: Phone Mockup + Controls (fills remaining when transcript hidden) ═══ */}
        <div style={{ minWidth: 0 }}>

          {/* Show-transcript restore bar — visible only when transcript is hidden */}
          {!showRightPanel && (
            <div style={{
              display: 'flex', justifyContent: 'flex-end', marginBottom: 10,
            }}>
              <button
                id="show-transcript-btn"
                className="topbar-btn btn-ghost"
                style={{ fontSize: 12, gap: 6 }}
                onClick={() => setShowRightPanel(true)}
              >
                <MessageSquare size={13} />
                Show Transcript
                <ChevronLeft size={12} />
              </button>
            </div>
          )}

          {/* Idle state prompt */}
          {callStatus === 'idle' && (
            <div className="call-phone-mockup animate-fadeIn" style={{ minHeight: 320, justifyContent: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Ready to Call
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 220 }}>
                Select a lead from the list to start an AI-powered call with Maya
              </div>
            </div>
          )}

          {/* Active call phone mockup */}
          {callStatus !== 'idle' && selectedLead && (
            <div className="call-phone-mockup animate-fadeIn">

              {/* Avatar with ring animation when dialing */}
              <div style={{ position: 'relative', width: 76, height: 76, marginBottom: 0 }}>
                {(callStatus === 'dialing' || callStatus === 'ringing') && (
                  <>
                    <div className="call-ring-outer" />
                    <div className="call-ring-outer" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
                <div
                  className="call-avatar"
                  style={{
                    position: 'absolute', inset: 0, margin: 'auto',
                    boxShadow: callStatus === 'connected'
                      ? '0 0 0 4px rgba(16,185,129,0.3)' : 'none',
                  }}
                >
                  {callStatus === 'escalated' ? '👨‍💼'
                   : callStatus === 'ended' ? '📴'
                   : `${selectedLead.name[0]}${selectedLead.name.split(' ')[1]?.[0] || ''}`}
                </div>
              </div>

              {/* Name + phone + status */}
              <div className="call-name">{selectedLead.name}</div>
              <div className="call-phone-num">{selectedLead.phone}</div>
              {selectedLead.preferred_language && (
                <div style={{
                  display: 'inline-block',
                  marginTop: '4px',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(74,222,128,0.12)',
                  border: '1px solid rgba(74,222,128,0.35)',
                  color: '#4ade80',
                  letterSpacing: '0.02em',
                }}>
                  {selectedLead.preferred_language === 'hindi' ? '🇮🇳 Hindi'
                   : selectedLead.preferred_language === 'hinglish' ? '🔀 Hinglish'
                   : '🌐 English'}
                </div>
              )}
              <div className="call-status-text" style={{ color: statusCfg.color }}>
                {statusCfg.label}
              </div>

              {/* Timer */}
              {callStatus === 'connected' && (
                <div className="call-timer">{callTimer}</div>
              )}

              {/* Voice wave */}
              {callStatus === 'connected' && agentSpeaking && (
                <div className="call-wave">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              )}

              {/* ── Keypad (connected state only) ──────────────── */}
              {callStatus === 'connected' && (
                <div className="call-keypad">

                  {/* Status bar — 4 distinct states */}
                  {(() => {
                    const lastMsg = transcript[transcript.length - 1]
                    const isThinking = agentSpeaking && lastMsg?.speaker === 'customer'
                    const isSpeaking = agentSpeaking && !isThinking

                    const barClass = isThinking ? 'speaking'
                      : isSpeaking ? 'speaking'
                      : isListening ? (autoListen ? 'listening-auto' : 'listening-manual')
                      : 'idle-bar'

                    const dotColor = (isThinking || isSpeaking) ? '#4f46e5'
                      : isListening ? (autoListen ? '#059669' : '#dc2626')
                      : '#d1d5db'

                    const label = isThinking
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14 }}>💭</span> Maya is thinking...
                        </span>
                      : isSpeaking
                        ? 'Maya is speaking...'
                        : isListening
                          ? (interimText
                              ? <span style={{ fontStyle: 'italic', fontWeight: 400 }}>&ldquo;{interimText}&rdquo;</span>
                              : '🎙️ Listening... speak now')
                          : '🎤 Tap mic to speak'

                    return (
                      <div className={`call-status-bar ${barClass}`}>
                        <span className="status-dot" style={{ background: dotColor, animation: (isThinking || isSpeaking) ? 'pulse-slow 1.2s infinite' : 'none' }} />
                        {label}
                      </div>
                    )
                  })()}

                  {/* Button row: Mute · BIG MIC · Auto */}
                  <div className="call-keypad-row">

                    <div className="call-keypad-btn">
                      <button
                        id="mute-btn"
                        className={`call-btn call-btn-sm call-btn-mute${isMuted ? ' call-btn-muted-active' : ''}`}
                        onClick={() => { setIsMuted(!isMuted); if (!isMuted) window.speechSynthesis.cancel() }}
                        title={isMuted ? 'Unmute Maya' : 'Mute Maya'}
                      >
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                      <span>{isMuted ? 'UNMUTE' : 'MUTE'}</span>
                    </div>

                    <div className="call-keypad-btn">
                      <button
                        id="mic-btn"
                        className={`call-btn call-btn-lg ${isListening ? 'call-btn-mic-active' : 'call-btn-mic-idle'}`}
                        onClick={() => {
                          if (isListening) { stopListening(); setIsListening(false) }
                          else { const ok = startListening(); if (ok) setIsListening(true) }
                        }}
                        title={isListening ? 'Stop listening' : 'Tap to speak'}
                      >
                        {isListening ? <MicOff size={28} color="#fff" /> : <Mic size={28} color="#fff" />}
                      </button>
                      <span style={{ fontSize: 9 }}>{isListening ? 'TAP TO STOP' : 'TAP TO SPEAK'}</span>
                    </div>

                    <div className="call-keypad-btn">
                      <button
                        id="auto-listen-btn"
                        className={`call-btn call-btn-sm call-btn-mute${autoListen ? ' call-btn-auto-active' : ''}`}
                        onClick={() => { setAutoListen(!autoListen); if (autoListen) { stopListening(); setIsListening(false) } }}
                        title={autoListen ? 'Auto-listen ON — click to disable' : 'Auto-listen OFF'}
                      >
                        <Zap size={18} />
                      </button>
                      <span>{autoListen ? 'AUTO ON' : 'AUTO OFF'}</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: '100%', height: 1, background: 'var(--border-subtle)' }} />

                  {/* End Call */}
                  <div className="call-keypad-btn">
                    <button
                      id="end-call-btn"
                      className="call-btn call-btn-end call-btn-end-sm"
                      onClick={callEnded || callStatus === 'ended'
                        ? () => { setCallStatus('idle'); setSelectedLead(null); setTranscript([]); stopListening(); setIsListening(false) }
                        : endCall
                      }
                      title={callEnded ? 'Start new call' : 'End call'}
                    >
                      {callEnded ? <Phone size={22} /> : <PhoneOff size={22} />}
                    </button>
                    <span style={{ color: callEnded ? '#059669' : '#dc2626' }}>
                      {callEnded ? 'NEW CALL' : 'END CALL'}
                    </span>
                  </div>

                </div>
              )}

              {/* End button for non-connected states */}
              {callStatus !== 'connected' && callStatus !== 'idle' && (
                <div style={{ marginTop: 20 }}>
                  <div className="call-keypad-btn">
                    <button
                      className="call-btn call-btn-end call-btn-end-sm"
                      onClick={callEnded || callStatus === 'ended'
                        ? () => { setCallStatus('idle'); setSelectedLead(null); setTranscript([]); stopListening(); setIsListening(false) }
                        : endCall
                      }
                    >
                      {callEnded ? <Phone size={20} /> : <PhoneOff size={20} />}
                    </button>
                    <span style={{ fontSize: 9, color: '#dc2626', fontWeight: 700 }}>END CALL</span>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Lead info card below phone mockup */}
          {selectedLead && callStatus !== 'idle' && (
            <div className="card animate-fadeIn" style={{ marginTop: 14 }}>
              <div className="card-header">
                <span className="card-title" style={{ fontSize: 13 }}>Customer Profile</span>
                <span className={`badge badge-${selectedLead.tag?.toLowerCase()}`}>{selectedLead.tag}</span>
              </div>
              <div className="card-body">
                <div className="lead-detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">🚗 Vehicle</div>
                    <div className="detail-value">{selectedLead.preferences?.vehicle_model || '—'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">⭐ Variant</div>
                    <div className="detail-value">{selectedLead.preferences?.variant || '—'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">💰 Budget</div>
                    <div className="detail-value">{selectedLead.preferences?.budget || '—'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">📝 Enquiry</div>
                    <div className="detail-value">{selectedLead.preferences?.enquiry_type || '—'}</div>
                  </div>
                </div>
                {selectedLead.preferences?.notes && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <div className="detail-label" style={{ marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {selectedLead.preferences.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══ COL 3: Transcript — only rendered when visible (no dead space) ═════ */}
        {showRightPanel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, animation: 'fadeIn 0.2s ease' }}>

            {/* Transcript card */}
            <div
              className="transcript-panel"
              style={{
                maxHeight: showTranscript ? 'calc(100vh - 180px)' : 52,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
              }}
            >
              {/* Header */}
              <div
                className="card-header"
                style={{ padding: '10px 14px', flexShrink: 0, gap: 8 }}
              >
                {/* Left: title + live indicator */}
                <span className="card-title" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={13} />
                  Live Transcript
                  {!showTranscript && transcript.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      ({transcript.length})
                    </span>
                  )}
                  {agentSpeaking && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4f46e5', fontWeight: 700, marginLeft: 4 }}>
                      <span className="status-dot" style={{ background: '#4f46e5' }} />
                      LIVE
                    </span>
                  )}
                </span>

                {/* Right: action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Collapse transcript bubbles */}
                  <button
                    id="toggle-transcript-btn"
                    onClick={() => setShowTranscript(s => !s)}
                    title={showTranscript ? 'Collapse transcript' : 'Expand transcript'}
                    style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 600,
                      background: '#f3f4f6', border: '1px solid #e5e7eb',
                      borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 3,
                      transition: 'all 0.15s',
                    }}
                  >
                    {showTranscript ? '▲ Collapse' : '▼ Expand'}
                  </button>
                  {/* Hide entire panel */}
                  <button
                    id="transcript-panel-toggle"
                    onClick={() => setShowRightPanel(false)}
                    title="Hide transcript panel"
                    style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 600,
                      background: '#f3f4f6', border: '1px solid #e5e7eb',
                      borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 3,
                      transition: 'all 0.15s',
                    }}
                  >
                    <ChevronRight size={11} /> Hide
                  </button>
                </div>
              </div>


              {/* Messages */}
              <div className="transcript-messages" ref={transcriptRef}>
                {transcript.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {callStatus === 'idle'
                      ? '← Select a lead to start the call'
                      : 'Connecting...'}
                  </div>
                )}
                {transcript.map((msg, i) => (
                  <div key={i} className={`transcript-bubble ${msg.speaker}`}>
                    <div className="bubble-speaker">
                      {msg.speaker === 'agent' ? '🤖 Maya' : '👤 Customer'}
                    </div>
                    {msg.text}
                  </div>
                ))}
                {isListening && (
                  <div className="transcript-bubble customer" style={{ opacity: 0.65 }}>
                    <div className="bubble-speaker">👤 Customer {interimText ? '(speaking...)' : ''}</div>
                    {interimText ? `"${interimText}"` : '🎤 Listening...'}
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic stage-aware quick-reply suggestions */}
            {callStatus === 'connected' && !callEnded && (() => {
              const turns = transcript.length
              const stage1 = ['Yes, I have time', 'Sure, go ahead please', 'Yes, kindly proceed', 'I have about 5 minutes', 'No, I am busy right now']
              const stage2 = ['I am interested in the Kushaq', 'Looking at the Slavia sedan', 'I want the Kodiaq SUV', 'I already own a Škoda Rapid', 'Need service for my vehicle']
              const stage3 = ['Budget is around 15 to 18 lakhs', 'I prefer automatic transmission', 'Looking for the Monte Carlo variant', 'Need finance assistance please', 'I want extended warranty details']
              const stage4 = ['I have not taken a test drive yet', 'Available on Saturday morning', 'Kindly send brochure on WhatsApp', 'I would like to exchange my old car', 'Connect me to senior executive']
              let suggestions, stageLabel
              if (turns <= 2) { suggestions = stage1; stageLabel = '🎙️ Availability' }
              else if (turns <= 6) { suggestions = stage2; stageLabel = '🚗 Vehicle Interest' }
              else if (turns <= 12) { suggestions = stage3; stageLabel = '💰 Budget & Details' }
              else { suggestions = stage4; stageLabel = '📅 Next Steps' }
              return (
                <div className="card animate-fadeIn">
                  <div className="card-body" style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                      {stageLabel} — Suggested replies
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {suggestions.map(phrase => (
                        <button key={phrase} id={'demo-'+phrase.slice(0,18).replace(/\s+/g,'-').toLowerCase()} className="topbar-btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => sendInput(phrase)}>
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Call ended summary */}
            {callEnded && (
              <div className="card animate-fadeInUp" style={{ border: '1px solid #bbf7d0' }}>
                <div className="card-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
                  <CheckCircle size={36} color="#10b981" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Call Completed</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
                    Duration: {callTimer} · {transcript.length} turns
                    {isEscalated && ' · Escalated to Human'}
                  </div>
                  <button
                    id="new-call-btn"
                    className="topbar-btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => { setCallStatus('idle'); setSelectedLead(null); setTranscript([]); stopListening(); setIsListening(false) }}
                  >
                    <Phone size={13} /> Start New Call
                  </button>
                  </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
