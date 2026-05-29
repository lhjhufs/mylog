import {
  isRetryExhaustedError,
  MAX_503_RETRIES,
  RETRY_DELAY_MS,
  RETRY_EXHAUSTED_MESSAGE,
  sleep,
} from "@/lib/retry";

const GEMINI_MODEL = "gemini-2.5-flash";

/** dev: Vite proxy · production: Vercel rewrite (vercel.json) */
function getGeminiBaseUrl(): string {
  return "/api/gemini";
}

function buildGeminiUrl(apiKey: string, path: string): string {
  const base = getGeminiBaseUrl();
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${path}${separator}key=${encodeURIComponent(apiKey)}`;
}

async function parseGeminiError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string; status?: string } };
    if (json?.error?.message) {
      return json.error.message;
    }
    return JSON.stringify(json);
  } catch {
    return (await response.text()) || `HTTP ${response.status}`;
  }
}

function wrapFetchError(error: unknown): Error {
  if (isRetryExhaustedError(error)) {
    return new Error(RETRY_EXHAUSTED_MESSAGE);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("Gemini API 요청 시간이 초과되었습니다.");
  }
  if (error instanceof TypeError && /fetch|network|cors/i.test(error.message)) {
    return new Error(
      "Gemini API에 연결할 수 없습니다. CORS/네트워크 오류일 수 있습니다. 개발 서버(pnpm dev)로 실행 중인지 확인해주세요.",
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Gemini API 호출 중 알 수 없는 오류가 발생했습니다.");
}

async function geminiPost(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const url = buildGeminiUrl(apiKey, `/v1beta/models/${GEMINI_MODEL}:generateContent`);

  for (let attempt = 0; attempt <= MAX_503_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status !== 503) {
        return response;
      }

      if (attempt < MAX_503_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw new Error(RETRY_EXHAUSTED_MESSAGE);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(RETRY_EXHAUSTED_MESSAGE);
}

export async function testGeminiConnection(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("Gemini API 키를 입력해주세요.");
  }

  try {
    const response = await geminiPost(
      trimmed,
      {
        contents: [{ parts: [{ text: "Respond with exactly: ok" }] }],
        generationConfig: { maxOutputTokens: 16, temperature: 0 },
      },
      15000,
    );

    if (!response.ok) {
      const detail = await parseGeminiError(response);
      throw new Error(`Gemini 연결 실패 (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini 응답은 수신했지만 내용이 비어 있습니다. API 키 권한을 확인해주세요.");
    }
  } catch (error) {
    throw wrapFetchError(error);
  }
}

export async function generateGeminiJson<T>(
  apiKey: string,
  prompt: string,
  options?: { temperature?: number },
): Promise<T> {
  const trimmed = apiKey.trim();

  try {
    const response = await geminiPost(
      trimmed,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.2,
          responseMimeType: "application/json",
        },
      },
      60000,
    );

    if (!response.ok) {
      const detail = await parseGeminiError(response);
      throw new Error(`Gemini 호출 실패 (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Gemini 응답에서 분석 텍스트를 찾을 수 없습니다.");
    }

    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1]?.trim() ?? text.trim();
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw wrapFetchError(error);
  }
}
