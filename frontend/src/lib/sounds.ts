/**
 * Synthesized UI sound effects using the Web Audio API.
 * No external files needed. All sounds are generated programmatically.
 */

type SoundName =
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

// ─── Sound definitions ────────────────────────────────────────────────────────

const SOUNDS: Record<SoundName, (vol: number) => void> = {
    join: (vol) => playSequence([
        { frequency: 440, type: 'sine', duration: 0.12, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 550, type: 'sine', duration: 0.12, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 660, type: 'sine', duration: 0.18, attack: 0.01, decay: 0.04, volume: 0.4 },
    ], vol, 0.04),

    leave: (vol) => playSequence([
        { frequency: 660, type: 'sine', duration: 0.12, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 550, type: 'sine', duration: 0.12, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 440, type: 'sine', duration: 0.18, attack: 0.01, decay: 0.04, volume: 0.3 },
    ], vol, 0.04),

    mute: (vol) => playTone(
        { frequency: 300, type: 'sine', duration: 0.14, attack: 0.005, decay: 0.04, volume: 0.3 },
        vol
    ),

    unmute: (vol) => playTone(
        { frequency: 480, type: 'sine', duration: 0.14, attack: 0.005, decay: 0.04, volume: 0.3 },
        vol
    ),

    cameraOn: (vol) => playSequence([
        { frequency: 520, type: 'triangle', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.3 },
        { frequency: 700, type: 'triangle', duration: 0.14, attack: 0.01, decay: 0.04, volume: 0.3 },
    ], vol, 0.04),

    cameraOff: (vol) => playSequence([
        { frequency: 700, type: 'triangle', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.3 },
        { frequency: 400, type: 'triangle', duration: 0.14, attack: 0.01, decay: 0.04, volume: 0.25 },
    ], vol, 0.04),

    screenShareOn: (vol) => playSequence([
        { frequency: 440, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.25 },
        { frequency: 660, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.25 },
        { frequency: 880, type: 'sine', duration: 0.16, attack: 0.01, decay: 0.05, volume: 0.3 },
    ], vol, 0.03),

    screenShareOff: (vol) => playSequence([
        { frequency: 880, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.25 },
        { frequency: 440, type: 'sine', duration: 0.16, attack: 0.01, decay: 0.05, volume: 0.2 },
    ], vol, 0.03),

    call: (vol) => playSequence([
        { frequency: 400, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 500, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 400, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
        { frequency: 500, type: 'sine', duration: 0.1, attack: 0.01, decay: 0.02, volume: 0.35 },
    ], vol, 0.05),
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function playSound(name: SoundName, volume = 1): void {
    try {
        if (typeof window === 'undefined' || !window.AudioContext) return;
        SOUNDS[name](Math.max(0, Math.min(1, volume)));
    } catch (e) {
        // Silently fail — sounds are non-critical
        console.warn('Sound playback failed:', e);
    }
}
