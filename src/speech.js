// Japanese read-aloud on top of the browser's built-in speech (Web Speech API).
// Works offline with the device's own voices; Edge and Chrome on desktop add free
// online Japanese voices (Microsoft "Natural", Google 日本語).

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
export const supported = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

let voicesCache = [];
let voicesReady = null;

/** Japanese voices, best first. Resolves after the browser has loaded its voice list. */
export function loadVoices() {
  if (!supported) return Promise.resolve([]);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const done = () => {
        const all = synth.getVoices();
        if (!all.length) return false;
        voicesCache = rank(all.filter((v) => /^ja\b|^ja-|jpn/i.test(v.lang)));
        resolve(voicesCache);
        return true;
      };
      if (done()) return;
      synth.addEventListener?.('voiceschanged', done);
      // some browsers (Safari) never fire voiceschanged; poll briefly
      let n = 0;
      const t = setInterval(() => { if (done() || ++n > 20) { clearInterval(t); resolve(voicesCache); } }, 150);
    });
  }
  return voicesReady;
}

// Neural / cloud voices sound far better than the old SAPI ones.
function score(v) {
  const n = v.name;
  if (/Natural|Online|Neural/i.test(n)) return 50; // Edge: Microsoft Nanami/Keita Online (Natural)
  if (/Google/i.test(n)) return 40; // Chrome: Google 日本語
  if (/Enhanced|Premium|Siri/i.test(n)) return 35; // Apple downloaded voices
  if (/Kyoko|O-Ren|Otoya|Hattori/i.test(n)) return 30; // Apple defaults
  if (/Nanami|Ayumi|Haruka|Sayaka|Ichiro|Keita/i.test(n)) return 20; // Windows voices
  return 10 + (v.localService ? 1 : 0);
}
const rank = (vs) => [...vs].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
export const voiceLabel = (v) => v.name.replace(/^Microsoft\s+/, '').replace(/\s*-\s*Japanese \(Japan\)/, '').replace(/\s*\(Natural\)/, ' · natural');
export const isPremium = (v) => score(v) >= 35;

export function pickVoice(uri) {
  return voicesCache.find((v) => v.voiceURI === uri) || voicesCache[0] || null;
}

let current = null; // keep a reference: Chrome garbage-collects utterances and drops onend
let keepAlive = null;

/**
 * Speak one piece of Japanese text. Resolves true when finished, false if interrupted.
 */
export function speak(text, { voiceURI, rate = 1, onstart } = {}) {
  if (!supported) return Promise.resolve(false);
  return new Promise((resolve) => {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voiceURI);
    if (v) u.voice = v;
    u.lang = v?.lang || 'ja-JP';
    u.rate = rate;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearInterval(keepAlive);
      if (current === u) current = null;
      resolve(ok);
    };
    u.onstart = () => onstart?.();
    u.onend = () => finish(true);
    u.onerror = (e) => finish(e.error !== 'interrupted' && e.error !== 'canceled' ? true : false);
    current = u;
    // Chrome stops Google voices after ~15 s of continuous speech; nudging it keeps it going.
    clearInterval(keepAlive);
    if (v && /Google/i.test(v.name)) keepAlive = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10000);
    // Safari sometimes needs a tick after cancel() before it accepts a new utterance.
    setTimeout(() => synth.speak(u), 30);
  });
}

export function stop() {
  clearInterval(keepAlive);
  current = null;
  synth?.cancel();
}

/** Help text for devices without any Japanese voice. */
export function noVoiceHelp() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) {
    if (/Firefox/.test(ua)) return 'Firefox only uses Windows voices. Add one in Windows Settings → Time & language → Speech → Add voices → Japanese, or open this page in Edge (free natural voices) or Chrome.';
    return 'Add a Japanese voice in Windows Settings → Time & language → Speech → Add voices → Japanese, then reload. Edge also has free natural Japanese voices.';
  }
  if (/Android/.test(ua)) return 'Install Japanese in Settings → System → Languages → Text-to-speech (Speech Services by Google), then reload.';
  if (/iPhone|iPad|Mac/.test(ua)) return 'Add a Japanese voice in Settings → Accessibility → Spoken Content → Voices → Japanese, then reload.';
  return 'Install a Japanese text-to-speech voice for your system, then reload.';
}
