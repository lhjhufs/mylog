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

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onComplete?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition({
  lang = "ko-KR",
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

  useEffect(() => {
    callbacksRef.current = { onTranscript, onComplete, onError };
  }, [onTranscript, onComplete, onError]);

  const setListening = useCallback((value: boolean) => {
    isListeningRef.current = value;
    setIsListening(value);
  }, []);

  const cleanupRecognition = useCallback(
    (recognition?: SpeechRecognitionInstance | null) => {
      if (recognition) {
        unregisterActiveRecognition(recognition);
      }
      if (recognitionRef.current === recognition || !recognition) {
        recognitionRef.current = null;
      }
      setListening(false);
    },
    [setListening],
  );

  /**
   * ⚠️ recognition.start()는 사용자 클릭 직후 동기 호출해야 함.
   * await/getUserMedia 후 호출하면 제스처가 끊겨 즉시 no-speech/network 오류 발생.
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

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = !isIosDevice();
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
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
      const text = finalTranscriptRef.current.trim();
      cleanupRecognition(recognition);
      userStopRef.current = false;

      if (text) {
        callbacksRef.current.onTranscript?.(text, true);
        callbacksRef.current.onComplete?.(text);
      }
    };

    recognition.onerror = (event) => {
      logSpeechError(event.error, event.message);
      cleanupRecognition(recognition);
      userStopRef.current = false;

      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }

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
      cleanupRecognition(recognition);
      callbacksRef.current.onError?.("음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }, [cleanupRecognition, lang, setListening]);

  const stop = useCallback(() => {
    userStopRef.current = true;
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (isListeningRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        unregisterActiveRecognition(recognition);
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
