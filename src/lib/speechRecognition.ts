/** Web Speech API (Chrome + Safari webkit prefix) */

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

let activeRecognition: SpeechRecognitionInstance | null = null;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;

  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function mapSpeechError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 권한을 허용해주세요";
    case "network":
      return "음성 인식 서버에 연결되지 않았습니다. localhost에서는 가끔 발생하며, 배포(HTTPS) 후에는 대부분 해결됩니다.";
    case "audio-capture":
      return "마이크를 사용할 수 없습니다. 다른 앱에서 마이크를 쓰고 있지 않은지 확인해주세요.";
    case "no-speech":
      return "";
    case "aborted":
      return "";
    default:
      return "다시 말씀해 주세요";
  }
}

export function releaseActiveRecognition(except?: SpeechRecognitionInstance): void {
  if (activeRecognition && activeRecognition !== except) {
    activeRecognition.onerror = null;
    activeRecognition.onend = null;
    activeRecognition.abort();
  }
  if (activeRecognition !== except) {
    activeRecognition = null;
  }
}

export function registerActiveRecognition(recognition: SpeechRecognitionInstance): void {
  releaseActiveRecognition(recognition);
  activeRecognition = recognition;
}

export function unregisterActiveRecognition(recognition: SpeechRecognitionInstance): void {
  if (activeRecognition === recognition) {
    activeRecognition = null;
  }
}

/** 전체 results 배열에서 텍스트 추출 (Chrome interim-only 대응) */
export function readTranscriptFromEvent(event: SpeechRecognitionEvent): string {
  let transcript = "";
  for (let i = 0; i < event.results.length; i++) {
    transcript += event.results[i][0]?.transcript ?? "";
  }
  return transcript.trim();
}

export function logSpeechError(error: string, message?: string): void {
  if (import.meta.env.DEV) {
    console.warn("[mylog speech]", error, message ?? "");
  }
}
