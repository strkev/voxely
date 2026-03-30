/**
 * Synthesized UI sound effects using the Web Audio API.
 * No external files needed. All sounds are generated programmatically.
 */

export type SoundName =
    | 'join'
    | 'leave'
    | 'mute'
    | 'unmute'
    | 'cameraOn'
    | 'cameraOff'
    | 'screenShareOn'
    | 'screenShareOff'
    | 'call';

// Shared AudioContext (created lazily on first use)
let ctx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
    if (typeof window === 'undefined') return {} as AudioContext;
    if (!ctx || ctx.state === 'closed') {
        const AudioContextClass = window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AudioContextClass();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

interface ToneParams {
    frequency: number;
    type: OscillatorType;
    duration: number;      // seconds
    attack: number;        // seconds
    decay: number;         // seconds
    volume: number;        // 0–1 master before user volume
}

function playTone(params: ToneParams, volume: number) {
    const ac = getSharedAudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = params.type;
    osc.frequency.setValueAtTime(params.frequency, ac.currentTime);

    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(params.volume * volume, ac.currentTime + params.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + params.duration - params.decay);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + params.duration);
}

function playSequence(tones: ToneParams[], volume: number, gap = 0.08) {
    const ac = getSharedAudioContext();
    let t = ac.currentTime;

    tones.forEach(params => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = params.type;
        osc.frequency.setValueAtTime(params.frequency, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(params.volume * volume, t + params.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + params.duration - params.decay);

        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + params.duration);

        t += params.duration + gap;
    });
}

function playChord(tones: ToneParams[], volume: number, stagger = 0) {
    const ac = getSharedAudioContext();
    const startTime = ac.currentTime;

    tones.forEach((params, i) => {
        const t = startTime + (i * stagger);
        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = params.type;
        osc.frequency.setValueAtTime(params.frequency, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(params.volume * volume, t + params.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + params.duration - params.decay);

        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + params.duration);
    });
}

// ─── Sound definitions ────────────────────────────────────────────────────────

const SOUNDS: Record<SoundName, (vol: number) => void> = {
    // A warm, slightly staggered major triad (A Major 7 feel)
    join: (vol) => playChord([
        { frequency: 440.00, type: 'sine', duration: 0.8, attack: 0.1, decay: 0.2, volume: 0.25 },  // A4
        { frequency: 554.37, type: 'sine', duration: 0.8, attack: 0.15, decay: 0.2, volume: 0.2 },  // C#5
        { frequency: 659.25, type: 'sine', duration: 0.8, attack: 0.2, decay: 0.2, volume: 0.15 },  // E5
    ], vol, 0.04),

    // A soft, fading singular tone
    leave: (vol) => playTone(
        { frequency: 329.63, type: 'sine', duration: 0.6, attack: 0.05, decay: 0.3, volume: 0.2 },  // E4
        vol
    ),

    mute: (vol) => playTone(
        { frequency: 280, type: 'sine', duration: 0.12, attack: 0.005, decay: 0.04, volume: 0.2 },
        vol
    ),

    unmute: (vol) => playTone(
        { frequency: 460, type: 'sine', duration: 0.12, attack: 0.005, decay: 0.04, volume: 0.2 },
        vol
    ),

    // Mechanical "Click-Clack" but elegant
    cameraOn: (vol) => playSequence([
        { frequency: 880, type: 'sine', duration: 0.04, attack: 0.001, decay: 0.01, volume: 0.15 },
        { frequency: 587, type: 'sine', duration: 0.15, attack: 0.01, decay: 0.05, volume: 0.25 },
    ], vol, 0.02),

    cameraOff: (vol) => playSequence([
        { frequency: 587, type: 'sine', duration: 0.04, attack: 0.001, decay: 0.01, volume: 0.15 },
        { frequency: 293.66, type: 'sine', duration: 0.15, attack: 0.01, decay: 0.05, volume: 0.25 },
    ], vol, 0.02),

    // Techy, shimmering rise
    screenShareOn: (vol) => playChord([
        { frequency: 880, type: 'sine', duration: 0.4, attack: 0.05, decay: 0.1, volume: 0.1 },
        { frequency: 1174.66, type: 'sine', duration: 0.4, attack: 0.1, decay: 0.1, volume: 0.1 },
        { frequency: 1760, type: 'sine', duration: 0.4, attack: 0.15, decay: 0.1, volume: 0.05 },
    ], vol, 0.03),

    screenShareOff: (vol) => playSequence([
        { frequency: 1174.66, type: 'sine', duration: 0.08, attack: 0.01, decay: 0.02, volume: 0.1 },
        { frequency: 440, type: 'sine', duration: 0.2, attack: 0.01, decay: 0.1, volume: 0.15 },
    ], vol, 0.02),

    call: (vol) => playSequence([
        { frequency: 400, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 500, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 400, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 500, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
    ], vol, 0.05),
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function playSound(name: SoundName, volume = 100): void {
    try {
        if (typeof window === 'undefined' || !window.AudioContext) return;
        SOUNDS[name](Math.max(0, Math.min(1, volume / 100)));
    } catch (e) {
        // Silently fail — sounds are non-critical
        console.warn('Sound playback failed:', e);
    }
}
