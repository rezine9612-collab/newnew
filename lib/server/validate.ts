// lib/server/validate.ts
// NeuPrint v4.0 validation & normalization
//
// Goals
// - Enforce minimal contract for derive.ts / inference.ts
// - Normalize gpt_raw types based on fields.gpt.json (source of truth)
// - Defensive: never crash on malformed GPT output, prefer null + warnings
//
// Non-goals
// - Full zod schema validation (that will be schema.ts stage)
// - UI text generation (belongs to blueprints.ts / UI layer)

import gptSpec from "@/lib/data/fields.gpt.json";

type Issue = { path: string; message: string; level: "error" | "warn" };
type ValidateResult = { report: any; errors: Issue[]; warnings: Issue[] };

function isObj(x: any): x is Record<string, any> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function getPath(obj: any, path: string): any {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj: any, path: string, value: any) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!isObj(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function toInt(x: any): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toFloat(x: any): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function toBool(x: any): boolean | null {
  if (x == null) return null;
  if (typeof x === "boolean") return x;
  const s = String(x).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function clampIntMin0(n: number): number {
  return Math.max(0, n);
}

function clampIntRange(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Pull field definitions from fields.gpt.json.
 * This is the source of truth for gpt_raw paths and types. :contentReference[oaicite:2]{index=2}
 */
function getGptFieldDefs(): Array<{ path: string; type: string }> {
  const fields = (gptSpec as any)?.fields || {};
  const defs: Array<{ path: string; type: string }> = [];
  for (const [path, row] of Object.entries(fields)) {
    // Only validate gpt_raw.* (skip other potential keys)
    if (!String(path).startsWith("gpt_raw.")) continue;
    const t = (row as any)?.type;
    // Some entries may omit type, keep as "unknown"
    defs.push({ path: String(path), type: typeof t === "string" ? t : "unknown" });
  }
  return defs;
}

/**
 * Normalize a single value by expected type.
 * We do not throw. We return {value, issue?}.
 */
function normalizeByType(path: string, type: string, value: any): { value: any; issue?: Issue } {
  // Preserve null as null
  if (value === null) return { value: null };

  // Some raw slots intentionally nullable
  if (value === undefined) return { value: undefined };

  const warn = (message: string): { value: any; issue: Issue } => ({
    value: null,
    issue: { path, message, level: "warn" },
  });

  switch (type) {
    case "int": {
      const n = toInt(value);
      if (n == null) return warn("Expected int, got non-numeric. Set to null.");
      return { value: clampIntMin0(n) };
    }
    case "int (1-3)": {
      const n = toInt(value);
      if (n == null) return warn("Expected int (1-3), got non-numeric. Set to null.");
      return { value: clampIntRange(n, 1, 3) };
    }
    case "boolean": {
      const b = toBool(value);
      if (b == null) return warn("Expected boolean, got non-boolean. Set to null.");
      return { value: b };
    }
    case "string": {
      if (typeof value === "string") return { value };
      return { value: String(value) };
    }
    case "enum": {
      // We do not hard-validate enum candidates here (schema.ts step).
      if (typeof value === "string") return { value };
      return { value: String(value) };
    }
    case "array<string>": {
      if (Array.isArray(value)) {
        return { value: value.map((v) => (v == null ? "" : String(v))) };
      }
      // allow single string -> array
      if (typeof value === "string") return { value: [value] };
      return warn("Expected array<string>, got non-array. Set to null.");
    }
    case "array<object>": {
      if (Array.isArray(value)) {
        // Keep only objects
        const cleaned = value.filter((v) => isObj(v));
        return { value: cleaned };
      }
      return warn("Expected array<object>, got non-array. Set to null.");
    }
    default: {
      // unknown type: keep as-is
      return { value };
    }
  }
}

/**
 * Ensure minimal skeleton required for downstream code.
 */
function ensureReportSkeleton(report: any, issues: Issue[]) {
  if (!isObj(report)) report = {};

  if (!isObj(report.gpt_raw)) report.gpt_raw = {};
  if (!isObj(report.gpt_raw.raw_features)) report.gpt_raw.raw_features = {};
  if (!isObj(report.gpt_raw.events)) report.gpt_raw.events = {};
  if (!Array.isArray(report.gpt_raw.events.revisions)) report.gpt_raw.events.revisions = [];
  if (!Array.isArray(report.gpt_raw.warnings)) report.gpt_raw.warnings = [];

  if (!isObj(report.backend)) report.backend = {};
  if (!isObj(report.backend.control)) report.backend.control = {};
  if (!isObj(report.backend.cff)) report.backend.cff = {};
  if (!isObj(report.backend.rsl)) report.backend.rsl = {};
  if (!isObj(report.backend.role_fit)) report.backend.role_fit = {};

  // units is the only hard requirement for derive.ts contract (>=1)
  const unitsRaw = report.gpt_raw.raw_features.units;
  const units = toInt(unitsRaw);
  if (units == null || units < 1) {
    report.gpt_raw.raw_features.units = 1;
    issues.push({
      path: "gpt_raw.raw_features.units",
      message: "units missing/invalid. Defaulted to 1 (minimum).",
      level: "warn",
    });
  } else {
    report.gpt_raw.raw_features.units = units;
  }

  return report;
}

/**
 * Normalize gpt_raw according to fields.gpt.json.
 * This does NOT compute backend scores. It only cleans types/ranges.
 */
export function normalizeReport(report: any): ValidateResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const issues: Issue[] = [];
  let out = ensureReportSkeleton(report, issues);

  const defs = getGptFieldDefs();

  // Normalize scalar gpt_raw fields
  for (const def of defs) {
    // Skip array item paths that include [] subpaths; handle only base arrays directly
    // Example: gpt_raw.events.revisions[] is an array, and its children are handled separately below.
    if (def.path.includes("[]") && !def.path.endsWith("[]")) continue;

    const current = getPath(out, def.path);
    const norm = normalizeByType(def.path, def.type, current);
    if (norm.issue) warnings.push(norm.issue);
    if (norm.value !== undefined) setPath(out, def.path.replace(/\[\]$/, ""), norm.value);
  }

  // Normalize revisions array items using the child definitions
  // fields.gpt.json contains:
  // - gpt_raw.events.revisions[] (array<object>)
  // - gpt_raw.events.revisions[].rev_id (string)
  // - gpt_raw.events.revisions[].type (enum)
  // - gpt_raw.events.revisions[].depth (int (1-3))
  // - gpt_raw.events.revisions[].trigger_marker (string)
  // - gpt_raw.events.revisions[].note (string)
  // :contentReference[oaicite:3]{index=3}
  const revs = out?.gpt_raw?.events?.revisions;
  if (Array.isArray(revs)) {
    const childDefs = defs.filter((d) => d.path.startsWith("gpt_raw.events.revisions[]."));
    const cleaned: any[] = [];
    for (let i = 0; i < revs.length; i++) {
      const r = revs[i];
      if (!isObj(r)) {
        warnings.push({
          path: `gpt_raw.events.revisions[${i}]`,
          message: "Revision item is not an object. Dropped.",
          level: "warn",
        });
        continue;
      }
      const rr: any = { ...r };
      for (const cd of childDefs) {
        const key = cd.path.split(".").slice(-1)[0]; // last segment
        const v = rr[key];
        const norm = normalizeByType(`gpt_raw.events.revisions[${i}].${key}`, cd.type, v);
        if (norm.issue) warnings.push(norm.issue);
        if (norm.value !== undefined) rr[key] = norm.value;
      }
      cleaned.push(rr);
    }
    out.gpt_raw.events.revisions = cleaned;
  }

  // Attach skeleton issues
  for (const it of issues) {
    if (it.level === "error") errors.push(it);
    else warnings.push(it);
  }

  return { report: out, errors, warnings };
}

/**
 * Hard validation gate for API.
 * - If strict=true, any errors -> throw.
 * - In MVP, prefer strict=false and allow warnings.
 */
export function validateReport(report: any, opts?: { strict?: boolean }): ValidateResult {
  const strict = Boolean(opts?.strict);
  const res = normalizeReport(report);

  // Minimal hard constraints beyond normalization
  // units must be >=1
  const units = toInt(res.report?.gpt_raw?.raw_features?.units);
  if (units == null || units < 1) {
    res.errors.push({
      path: "gpt_raw.raw_features.units",
      message: "units must be >= 1",
      level: "error",
    });
  }

  // If strict, throw
  if (strict && res.errors.length > 0) {
    const msg = res.errors.map((e) => `${e.path}: ${e.message}`).join(" | ");
    throw new Error(`validateReport failed: ${msg}`);
  }

  return res;
}

/**
 * Convenience helper for route.ts:
 * - returns normalized report
 * - logs issues into report.gpt_raw.warnings (non-fatal)
 */
export function applyValidationToReport(report: any, opts?: { strict?: boolean }) {
  const res = validateReport(report, opts);
  const out = res.report;

  // Merge warnings into gpt_raw.warnings array (string payload)
  if (!Array.isArray(out.gpt_raw.warnings)) out.gpt_raw.warnings = [];
  for (const w of res.warnings) {
    out.gpt_raw.warnings.push({
      code: "VALIDATION_WARNING",
      message: `${w.path}: ${w.message}`,
    });
  }
  // Errors also included as warnings in MVP unless strict=true is used
  for (const e of res.errors) {
    out.gpt_raw.warnings.push({
      code: "VALIDATION_ERROR",
      message: `${e.path}: ${e.message}`,
    });
  }

  return out;
}
