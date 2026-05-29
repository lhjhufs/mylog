import { requireUserId, withTimeout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export interface UserSettings {
  id: string;
  user_id: string;
  display_name: string | null;
  gemini_api_key: string | null;
  google_calendar_connected: boolean;
  updated_at: string;
}

export async function getMySettings(): Promise<UserSettings | null> {
  const userId = await requireUserId();

  const { data, error } = await withTimeout(
    supabase.from("settings").select("*").eq("user_id", userId).maybeSingle(),
    15000,
    "settings 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`settings 조회 실패: ${error.message}`);
  }

  return (data as UserSettings | null) ?? null;
}

export async function getGeminiApiKeyForUser(userId: string): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.from("settings").select("gemini_api_key").eq("user_id", userId).maybeSingle(),
    15000,
    "settings 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`settings 조회 실패: ${error.message}`);
  }
  if (!data?.gemini_api_key?.trim()) {
    throw new Error("설정에서 Gemini API 키를 등록해주세요. (설정 → API 연동)");
  }

  return data.gemini_api_key.trim();
}

export async function saveMySettings(input: {
  display_name?: string | null;
  gemini_api_key?: string;
  google_calendar_connected?: boolean;
}): Promise<UserSettings> {
  const userId = await requireUserId();

  const payload = {
    user_id: userId,
    ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
    ...(input.gemini_api_key !== undefined ? { gemini_api_key: input.gemini_api_key } : {}),
    ...(input.google_calendar_connected !== undefined
      ? { google_calendar_connected: input.google_calendar_connected }
      : {}),
  };

  const { data, error } = await withTimeout(
    supabase.from("settings").upsert(payload, { onConflict: "user_id" }).select("*").single(),
    15000,
    "settings 저장 시간이 초과되었습니다. Supabase RLS/테이블 설정을 확인해주세요.",
  );

  if (error) {
    throw new Error(`settings 저장 실패: ${error.message}`);
  }

  if (!data) {
    throw new Error("settings 저장 후 반환된 데이터가 없습니다. SELECT RLS 정책을 확인해주세요.");
  }

  return data as UserSettings;
}
