"""
audio_bridge.py — Audio format converters for Twilio Media Streams.

Twilio sends/receives µ-law 8kHz G.711.
Deepgram expects WAV PCM.
ElevenLabs returns MP3.
"""

try:
    import audioop
except ModuleNotFoundError:
    import audioop_lts as audioop  # Python 3.13+ backport
import io
import wave

TWILIO_RATE   = 8_000   # Hz — fixed by Twilio PSTN
DEEPGRAM_RATE = 16_000  # Hz — Nova-2 performs best at 16kHz


def mulaw_to_wav(mulaw_bytes: bytes) -> bytes:
    """Convert Twilio µ-law payload to WAV bytes for Deepgram."""
    pcm8k  = audioop.ulaw2lin(mulaw_bytes, 2)
    pcm16k = audioop.ratecv(pcm8k, 2, 1, TWILIO_RATE, DEEPGRAM_RATE, None)[0]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(DEEPGRAM_RATE)
        wf.writeframes(pcm16k)
    return buf.getvalue()


def pcm_to_mulaw(pcm_bytes: bytes) -> bytes:
    """Convert raw 8kHz 16-bit mono PCM (from ElevenLabs pcm_8000) to µ-law for Twilio."""
    return audioop.lin2ulaw(pcm_bytes, 2)
