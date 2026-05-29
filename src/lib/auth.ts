import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** onAuthStateChange 콜백 안에서 await supabase.* 하면 교착(deadlock)이 날 수 있음 */
export function deferAuthSideEffect(fn: () => void): void {
  window.setTimeout(fn, 0);
}

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

/** 세션(로컬) 우선, 필요 시 getUser — 프로필/설정용 */
export async function getAuthUser(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    8000,
    "로그인 세션 확인 시간이 초과되었습니다.",
  );

  if (sessionError) {
    throw new Error(`세션 조회 실패: ${sessionError.message}`);
  }

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    8000,
    "계정 정보 확인 시간이 초과되었습니다.",
  );

  if (userError) {
    throw new Error(`계정 정보 조회 실패: ${userError.message}`);
  }

  return userData.user;
}
