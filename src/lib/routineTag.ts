const ROUTINE_TAG_PATTERN = /\[루틴\]/i;

export function isRoutineTaggedInput(rawInput: string): boolean {
  return ROUTINE_TAG_PATTERN.test(rawInput);
}

/** "[루틴] 아침 운동 30분" → "아침 운동 30분" */
export function parseRoutineName(rawInput: string): string {
  return rawInput.replace(ROUTINE_TAG_PATTERN, "").trim();
}

export function normalizeRoutineName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isRoutineEntry(entry: { category: string; raw_input: string }): boolean {
  return entry.category === "routine" || isRoutineTaggedInput(entry.raw_input);
}
