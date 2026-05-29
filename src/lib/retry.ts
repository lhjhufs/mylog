export const RETRY_DELAY_MS = 3000;
export const MAX_503_RETRIES = 3;

export const RETRY_EXHAUSTED_MESSAGE = "잠시 후 다시 시도해주세요";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function isRetryExhaustedError(error: unknown): boolean {
  return error instanceof Error && error.message === RETRY_EXHAUSTED_MESSAGE;
}
