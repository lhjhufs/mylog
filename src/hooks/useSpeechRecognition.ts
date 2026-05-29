import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  logSpeechError,
  mapSpeechError,
  readTranscriptFromEvent,
  registerActiveRecognition,
  releaseActiveRecognition,
  unregisterActiveRecognition,
  type SpeechRecognitionInstance,
} from "@/lib/speechRecognition";

const DEFAULT_LISTEN_TIMEOUT_MS = 10_000;
/** 말한 뒤 침묵 시 자동 종료 (onend 미발화 대비) */
const SILENCE_TIMEOUT_MS = 2_500;
/** stop() 후 onend 미발화 시 강제 정리 대기 */
const END_GRACE_MS = 600;

export interface UseSpeechRecognitionOptions {
  lang?: string;
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
  const latestTranscriptRef = useRef("");
  const callbacksRef = useRef({ onTranscript, onComplete, onError });
  const isListeningRef = useRef(false);
  const userStopRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const hasResultRef = useRef(false);
  const maxListenTimeoutRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const endGraceRef = useRef<number | null>(null);

  useEffect(() => {
    callbacksRef.current = { onTranscript, onComplete, onError };
  }, [onTranscript, onComplete, onError]);

  const setListening = useCallback((value: boolean) => {
    isListeningRef.current = value;
    setIsListening(value);
  }, []);

  const clearTimers = useCallback(() => {
    if (maxListenTimeoutRef.current != null) {
      window.clearTimeout(maxListenTimeoutRef.current);
      maxListenTimeoutRef.current = null;
    }
    if (silenceTimeoutRef.current != null) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
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

      const text = latestTranscriptRef.current.trim();
      const active = recognition ?? recognitionRef.current;
      if (active) {
        unregisterActiveRecognition(active);
      }
      if (recognitionRef.current === active || !active) {
        recognitionRef.current = null;
      }
      setListening(false);

      const wasUserStop = userStopRef.current;
      userStopRef.current = false;

      if (text) {
        callbacksRef.current.onTranscript?.(text, true);
        callbacksRef.current.onComplete?.(text);
        return;
      }

      if (!hasResultRef.current && !wasUserStop) {
        callbacksRef.current.onError?.(
          "음성이 인식되지 않았습니다. 마이크 권한과 입력 장치를 확인해주세요.",
        );
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
        // abort()는 Chrome에서 interim 결과를 날릴 수 있어 stop()만 사용
        finalizeSession(recognition);
      }, END_GRACE_MS);
    },
    [finalizeSession],
  );

  const requestEnd = useCallback(
    (recognition: SpeechRecognitionInstance) => {
      if (sessionEndedRef.current) return;

      if (silenceTimeoutRef.current != null) {
        window.clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      if (maxListenTimeoutRef.current != null) {
        window.clearTimeout(maxListenTimeoutRef.current);
        maxListenTimeoutRef.current = null;
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

  const resetSilenceTimeout = useCallback(
    (recognition: SpeechRecognitionInstance) => {
      if (silenceTimeoutRef.current != null) {
        window.clearTimeout(silenceTimeoutRef.current);
      }
      silenceTimeoutRef.current = window.setTimeout(() => {
        silenceTimeoutRef.current = null;
        if (!sessionEndedRef.current && recognitionRef.current === recognition) {
          requestEnd(recognition);
        }
      }, SILENCE_TIMEOUT_MS);
    },
    [requestEnd],
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
    latestTranscriptRef.current = "";
    hasResultRef.current = false;
    userStopRef.current = false;
    sessionEndedRef.current = false;
    clearTimers();

    const recognition = new Ctor();
    recognition.lang = lang;
    // 데스크톱 Chrome: continuous=true 시 onend/onresult 불안정 → false 통일
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      resetSilenceTimeout(recognition);
      maxListenTimeoutRef.current = window.setTimeout(() => {
        maxListenTimeoutRef.current = null;
        if (!sessionEndedRef.current && recognitionRef.current === recognition) {
          requestEnd(recognition);
        }
      }, listenTimeoutMs);
    };

    recognition.onresult = (event) => {
      hasResultRef.current = true;
      const transcript = readTranscriptFromEvent(event);
      latestTranscriptRef.current = transcript;
      callbacksRef.current.onTranscript?.(transcript, false);
      resetSilenceTimeout(recognition);
    };

    recognition.onend = () => {
      if (sessionEndedRef.current) return;
      finalizeSession(recognition);
    };

    recognition.onerror = (event) => {
      logSpeechError(event.error, event.message);

      if (event.error === "aborted" || event.error === "no-speech") {
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
    resetSilenceTimeout,
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
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
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
