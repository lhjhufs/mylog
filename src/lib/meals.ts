import type { EntryRecord } from "@/lib/entries";

export interface MealParsedData {
  food: string;
  calories: number;
}

/** 먹음/마심 등 + 음식·음료 단서 */
const MEAL_ACTION_PATTERN =
  /먹(었|음|다|을|는|기|어)|마셨|마심|마시|드셨|드셨|섭취|한\s*잔|한잔|식사|간식|브런치|아침에|점심에|저녁에/;

const FOOD_OR_DRINK_PATTERN =
  /빵|밥|면|국|탕|찌개|피자|치킨|버거|샐러드|과일|케이크|디저트|커피|아메리카노|라떼|카페|음료|스무디|주스|우유|차\b|라면|김밥|비빔밥|떡|만두|고기|생선|치즈|요거트|시리얼|도시락|샌드위치|빙수|아이스크림|슈크림|크루아상|베이글|도넛|쿠키|와플|팬케이크|햄버거|스테이크|초밥|회\b|순두부|두부|계란|달걀|볶음밥|덮밥|죽\b|떡볶이|핫도그|토스트|베이커리|디저트|음식|메뉴|두바이/;

const NOT_MEAL_PATTERN = /약\s*(먹|복용|챙)|먹.*\b약\b|영양제|처방|복용/;

const CALORIE_RULES: { pattern: RegExp; calories: number }[] = [
  { pattern: /아메리카노|에스프레소/i, calories: 15 },
  { pattern: /라떼|카페라떼|카푸치노|모카|바닐라라떼/i, calories: 200 },
  { pattern: /커피|아이스티|티\b|차\b/i, calories: 50 },
  { pattern: /주스|스무디|에이드/i, calories: 120 },
  { pattern: /우유|라떼/i, calories: 150 },
  { pattern: /두바이|슈크림|크루아상|베이커리|빵|도넛|베이글|와플|팬케이크|토스트/i, calories: 380 },
  { pattern: /케이크|디저트|쿠키|아이스크림|빙수/i, calories: 350 },
  { pattern: /라면|짜장|짬뽕|파스타|우동/i, calories: 550 },
  { pattern: /김밥|비빔밥|볶음밥|덮밥|도시락/i, calories: 500 },
  { pattern: /치킨|피자|햄버거/i, calories: 700 },
  { pattern: /샐러드/i, calories: 250 },
];

export function looksLikeMealInput(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text || NOT_MEAL_PATTERN.test(text)) return false;

  const hasAction = MEAL_ACTION_PATTERN.test(text);
  const hasFoodOrDrink = FOOD_OR_DRINK_PATTERN.test(text);
  const mealTimeWithFood =
    /(아침|점심|저녁|간식)/.test(text) && (hasFoodOrDrink || hasAction);

  return (hasAction && hasFoodOrDrink) || mealTimeWithFood;
}

/** "두바이 슈크림 빵과 아메리카노 한 잔 먹음" → "두바이 슈크림 빵, 아메리카노" */
export function extractFoodLabelFromInput(rawInput: string): string {
  let text = rawInput
    .trim()
    .replace(/^(오늘|방금|어제)\s+/g, "")
    .replace(/^(아침|점심|저녁|간식)(에|으로|은|는)?\s*/g, "")
    .replace(/\s*(먹었(어|다|음)?|먹음|마셨(어|다|음)?|마심|했다|했어|함|섭취)\s*\.?$/g, "")
    .replace(/\s*한\s*잔\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = text.split(/\s*(?:과|와|랑|이랑|하고|,|\/)\s*/).filter((p) => p.length > 0);
  if (parts.length > 1) {
    return parts.map((p) => p.trim()).join(", ");
  }

  return text;
}

export function estimateCaloriesFromFoodLabel(foodLabel: string): number {
  const items = foodLabel.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return 300;

  let total = 0;
  for (const item of items) {
    let matched = false;
    for (const rule of CALORIE_RULES) {
      if (rule.pattern.test(item)) {
        total += rule.calories;
        matched = true;
        break;
      }
    }
    if (!matched) total += 250;
  }

  return Math.max(total, 50);
}

/** Gemini 응답·기존 데이터 모두 지원 */
export function extractMealFromParsedData(
  parsed: Record<string, unknown>,
  rawInput?: string,
): MealParsedData | null {
  const foodDirect = typeof parsed.food === "string" ? parsed.food.trim() : "";
  let calories = Number(parsed.calories);

  if (foodDirect && !Number.isNaN(calories) && calories > 0) {
    return { food: foodDirect, calories: Math.round(calories) };
  }

  const foods = parsed.foods;
  if (Array.isArray(foods) && foods.length > 0) {
    const names = foods
      .map((f) => {
        if (typeof f === "string") return f.trim();
        if (f && typeof f === "object" && "name" in f) return String((f as { name: string }).name).trim();
        return "";
      })
      .filter(Boolean);

    if (names.length > 0) {
      if (Number.isNaN(calories) || calories <= 0) {
        calories = Number(parsed.calories_total ?? parsed.total_calories);
      }
      const food = names.join(", ");
      if (!Number.isNaN(calories) && calories > 0) {
        return { food, calories: Math.round(calories) };
      }
      return { food, calories: estimateCaloriesFromFoodLabel(food) };
    }
  }

  if (foodDirect) {
    const cal =
      !Number.isNaN(calories) && calories > 0
        ? Math.round(calories)
        : estimateCaloriesFromFoodLabel(foodDirect);
    return { food: foodDirect, calories: cal };
  }

  if (rawInput?.trim() && looksLikeMealInput(rawInput)) {
    const food = extractFoodLabelFromInput(rawInput);
    const cal =
      !Number.isNaN(calories) && calories > 0
        ? Math.round(calories)
        : estimateCaloriesFromFoodLabel(food);
    return { food, calories: cal };
  }

  return null;
}

export function normalizeMealParsedData(
  parsed: Record<string, unknown>,
  rawInput: string,
): Record<string, unknown> {
  const meal = extractMealFromParsedData(parsed, rawInput);
  if (!meal) {
    const fallbackFood = extractFoodLabelFromInput(rawInput);
    return {
      ...parsed,
      food: typeof parsed.food === "string" ? parsed.food : fallbackFood || rawInput.trim(),
      calories:
        typeof parsed.calories === "number" && parsed.calories > 0
          ? parsed.calories
          : fallbackFood
            ? estimateCaloriesFromFoodLabel(fallbackFood)
            : null,
    };
  }
  return {
    ...parsed,
    food: meal.food,
    calories: meal.calories,
  };
}

export function sumMealCaloriesFromEntries(entries: EntryRecord[]): number | null {
  let total = 0;
  let hasValue = false;

  for (const entry of entries) {
    if (entry.category !== "meal") continue;
    const parsed = (entry.parsed_data ?? {}) as Record<string, unknown>;
    const meal = extractMealFromParsedData(parsed, entry.raw_input);
    if (meal) {
      total += meal.calories;
      hasValue = true;
    }
  }

  return hasValue ? total : null;
}

export function formatCaloriesKcal(value: number): string {
  return `${value.toLocaleString("ko-KR")} kcal`;
}

export function formatCaloriesInline(value: number): string {
  return `${value.toLocaleString("ko-KR")}kcal`;
}
