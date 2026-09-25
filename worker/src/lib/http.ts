import type { Context } from "hono";
import type { ZodType } from "zod";

export interface FieldError {
  field: string;
  en: string;
  bn: string;
}

/** Every API error carries a plain-language message in both languages. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public en: string,
    public bn: string,
    public fields?: FieldError[],
  ) {
    super(en);
  }
}

export const E = {
  notFound: (what = "Item") => new ApiError(404, "not_found", `${what} not found.`, "খুঁজে পাওয়া যায়নি।"),
  unauthorized: () => new ApiError(401, "unauthorized", "Please sign in to continue.", "চালিয়ে যেতে সাইন ইন করুন।"),
  forbidden: () => new ApiError(403, "forbidden", "You don't have permission to do this.", "এই কাজটি করার অনুমতি আপনার নেই।"),
  badRequest: (en: string, bn: string) => new ApiError(400, "bad_request", en, bn),
  conflict: (en: string, bn: string) => new ApiError(409, "conflict", en, bn),
  tooMany: () => new ApiError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.", "অনেকবার চেষ্টা করা হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।"),
};

type Issue = { code: string; path: PropertyKey[]; message: string; minimum?: unknown; maximum?: unknown; origin?: string; format?: string };

function issueToField(issue: Issue): FieldError {
  const field = issue.path.map(String).join(".") || "_";
  const min = issue.minimum as number | undefined;
  const max = issue.maximum as number | undefined;
  switch (issue.code) {
    case "invalid_type":
      return { field, en: "This field is required.", bn: "এই ঘরটি পূরণ করা আবশ্যক।" };
    case "too_small":
      return issue.origin === "string"
        ? min === 1
          ? { field, en: "This field is required.", bn: "এই ঘরটি পূরণ করা আবশ্যক।" }
          : { field, en: `Must be at least ${min} characters.`, bn: `কমপক্ষে ${min} অক্ষর লিখুন।` }
        : issue.origin === "array"
          ? { field, en: `Add at least ${min}.`, bn: `কমপক্ষে ${min}টি যোগ করুন।` }
          : { field, en: `Must be at least ${min}.`, bn: `সর্বনিম্ন ${min} হতে হবে।` };
    case "too_big":
      return issue.origin === "string"
        ? { field, en: `Must be at most ${max} characters.`, bn: `সর্বোচ্চ ${max} অক্ষর লেখা যাবে।` }
        : { field, en: `Must be at most ${max}.`, bn: `সর্বোচ্চ ${max} হতে পারে।` };
    case "invalid_format":
      if (issue.format === "email") return { field, en: "Enter a valid email address.", bn: "সঠিক ইমেইল ঠিকানা লিখুন।" };
      return { field, en: issue.message || "Invalid format.", bn: "সঠিক ফরম্যাটে লিখুন।" };
    case "invalid_value":
      return { field, en: "Please choose one of the options.", bn: "একটি অপশন বেছে নিন।" };
    case "custom":
      return { field, en: issue.message, bn: issue.message };
    default:
      return { field, en: issue.message || "Invalid value.", bn: "সঠিক তথ্য দিন।" };
  }
}

export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields = (r.error.issues as unknown as Issue[]).map(issueToField);
  throw new ApiError(422, "validation", "Please fix the highlighted fields.", "চিহ্নিত ঘরগুলো ঠিক করুন।", fields);
}

export async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw E.badRequest("Invalid request body.", "অনুরোধটি সঠিক নয়।");
  }
  return validate(schema, data);
}

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export const nowIso = () => new Date().toISOString();

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function intParam(v: string | undefined, def: number, min = 1, max = 1000): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Normalises Bangladeshi mobile numbers to 01XXXXXXXXX. Returns null when invalid. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "").replace(/^(?:00)?880/, "0");
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
