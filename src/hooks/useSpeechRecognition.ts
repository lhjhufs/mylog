import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isIosDevice,
  isSpeechRecognitionSupported,
  logSpeechError,
  mapSpeechError,
  registerActiveRecognition,
  releaseActiveRecognition,
  unregisterActiveRecognition,
  type SpeechRecognitionInstance,
} from "@/lib/speechRecognition";

const DEFAULT_LISTEN_TIMEOUT_MS = 10_000;
/** stop() 후 onend 미발화 시 강제 정리 대기 (Chrome 데스크톱) */
const END_GRACE_MS = 300;

export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** 최대 녹음 시간 (기본 10초) */
  listenTimeoutMs?: number;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onComplete?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition({
  lang = "ko-KR",
  listenTimeoutMs = DEFAULT_LISTEN_TIMEOUT_MS,
  onTranscript,
  onComplete,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(isSpeechRecognitionSupported);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const callbacksRef = useRef({ onTranscript, onComplete, onError });
  const isListeningRef = useRef(false);
  const userStopRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const listenTimeoutRef = useRef<number | null>(null);
  const endGraceRef = useRef<number | null>(null);

  useEffect(() => {
    callbacksRef.current = { onTranscript, onComplete, onError };
  }, [onTranscript, onComplete, onError]);

  const setListening = useCallback((value: boolean) => {
    isListeningRef.current = value;
    setIsListening(value);
  }, []);

  const clearTimers = useCallback(() => {
    if (listenTimeoutRef.current != null) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    if (endGraceRef.current != null) {
      window.clearTimeout(endGraceRef.current);
      endGraceRef.current = null;
    }
  }, []);

  const finalizeSession = useCallback(
    (recognition: SpeechRecognitionInstance | null) => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;
      clearTimers();

      const text = finalTranscriptRef.current.trim();
      const active = recognition ?? recognitionRef.current;
      if (active) {
        unregisterActiveRecognition(active);
      }
      if (recognitionRef.current === active || !active) {
        recognitionRef.current = null;
      }
      setListening(false);
      userStopRef.current = false;

      if (text) {
        callbacksRef.current.onTranscript?.(text, true);
        callbacksRef.current.onComplete?.(text);
      }
    },
    [clearTimers, setListening],
  );

  const scheduleForcedFinalize = useCallback(
    (recognition: SpeechRecognitionInstance) => {
      if (endGraceRef.current != null) return;

      endGraceRef.current = window.setTimeout(() => {
        endGraceRef.current = null;
        if (sessionEndedRef.current) return;

        if (recognitionRef.current === recognition) {
          try {
            recognition.abort();
          } catch {
            /* Chrome may ignore abort after stop */
          }
        }
        finalizeSession(recognition);
      }, END_GRACE_MS);
    },
    [finalizeSession],
  );

  const requestEnd = useCallback(
    (recognition: SpeechRecognitionInstance) => {
      if (sessionEndedRef.current) return;

      if (listenTimeoutRef.current != null) {
        window.clearTimeout(listenTimeoutRef.current);
        listenTimeoutRef.current = null;
      }

      try {
        recognition.stop();
      } catch (error) {
        logSpeechError("stop-failed", error instanceof Error ? error.message : String(error));
        finalizeSession(recognition);
        return;
      }

      scheduleForcedFinalize(recognition);
    },
    [finalizeSession, scheduleForcedFinalize],
  );

  const cleanupRecognition = useCallback(
    (recognition?: SpeechRecognitionInstance | null) => {
      clearTimers();
      if (recognition) {
        unregisterActiveRecognition(recognition);
      }
      if (recognitionRef.current === recognition || !recognition) {
        recognitionRef.current = null;
      }
      setListening(false);
    },
    [clearTimers, setListening],
  );

  /**
   * ⚠️ recognition.start()는 사용자 클릭 직후 동기 호출해야 함.
   */
  const start = useCallback(() => {
    if (isListeningRef.current) {
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacksRef.current.onError?.("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }

    releaseActiveRecognition();
    finalTranscriptRef.current = "";
    userStopRef.current = false;
    sessionEndedRef.current = false;
    clearTimers();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = !isIosDevice();
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      listenTimeoutRef.current = window.setTimeout(() => {
        listenTimeoutRef.current = null;
        if (!sessionEndedRef.current && recognitionRef.current === recognition) {
          requestEnd(recognition);
        }
      }, listenTimeoutMs);
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscriptRef.current += piece;
        } else {
          interim += piece;
        }
      }
      const combined = (finalTranscriptRef.current + interim).trim();
      callbacksRef.current.onTranscript?.(combined, false);
    };

    recognition.onend = () => {
      if (sessionEndedRef.current) return;
      finalizeSession(recognition);
    };

    recognition.onerror = (event) => {
      logSpeechError(event.error, event.message);

      if (event.error === "aborted") {
        if (!sessionEndedRef.current) {
          finalizeSession(recognition);
        }
        return;
      }

      if (event.error === "no-speech") {
        if (!sessionEndedRef.current) {
          finalizeSession(recognition);
        }
        return;
      }

      sessionEndedRef.current = true;
      clearTimers();
      cleanupRecognition(recognition);
      userStopRef.current = false;

      const message = mapSpeechError(event.error);
      if (message) {
        callbacksRef.current.onError?.(message);
      }
    };

    recognitionRef.current = recognition;
    registerActiveRecognition(recognition);

    try {
      recognition.start();
    } catch (error) {
      logSpeechError("start-failed", error instanceof Error ? error.message : String(error));
      sessionEndedRef.current = true;
      cleanupRecognition(recognition);
      callbacksRef.current.onError?.("음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }, [
    cleanupRecognition,
    clearTimers,
    finalizeSession,
    lang,
    listenTimeoutMs,
    requestEnd,
    setListening,
  ]);

  const stop = useCallback(() => {
    userStopRef.current = true;
    const recognition = recognitionRef.current;
    if (!recognition) {
      finalizeSession(null);
      return;
    }
    requestEnd(recognition);
  }, [finalizeSession, requestEnd]);

  const toggle = useCallback(() => {
    if (isListeningRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  useEffect(() => {
    return () => {
      clearTimers();
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        unregisterActiveRecognition(recognition);
      }
      recognitionRef.current = null;
      sessionEndedRef.current = true;
    };
  }, [clearTimers]);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
