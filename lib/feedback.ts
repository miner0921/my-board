// 스캐너 작업자 피드백: Web Audio 비프 + navigator.vibrate.
// 클라이언트 전용. 모듈 레벨 싱글톤 AudioContext.
//
// 브라우저 자동재생 정책상 AudioContext는 사용자 제스처(keydown/click/touch)
// 핸들러 안에서 처음 만들어져야 한다. 검수 페이지에서 input의
// onKeyDown/onFocus에서 initAudio()를 호출해 활성화한다.

type AnyWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
let enabled = false;

export function initAudio(): boolean {
  if (typeof window === "undefined") return false;
  if (ctx) {
    // 일부 브라우저는 suspended로 시작 — 사용자 제스처에서 resume
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return enabled;
  }
  try {
    const w = window as AnyWindow;
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    enabled = true;
    return true;
  } catch {
    return false;
  }
}

function tone(freq: number, durMs: number, delayMs = 0) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.18, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000);
}

export function beepSuccess() {
  tone(800, 90);
}

export function beepError() {
  tone(220, 130);
  tone(220, 130, 160);
}

export function beepComplete() {
  tone(800, 110);
  tone(1000, 110, 130);
  tone(1300, 220, 270);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // iOS Safari 등 미지원 환경 — 무시
  }
}
