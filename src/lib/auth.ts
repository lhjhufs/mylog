import { supabase } from "@/lib/supabase";

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export async function requireUserId(): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    8000,
    "로그인 세션 확인 시간이 초과되었습니다. 다시 로그인해주세요.",
  );

  if (error) {
    throw new Error(`세션 조회 실패: ${error.message}`);
  }

  const userId = data.session?.user?.id;
  if (!userId) {
    throw new Error("로그인된 사용자만 사용할 수 있습니다.");
  }

  return userId;
}
