export function strongETag(value: unknown): value is string {
  return typeof value === "string" && /^"[\x21\x23-\x7e]{0,254}"$/.test(value);
}
