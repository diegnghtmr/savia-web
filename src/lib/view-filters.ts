export type SearchParams = Record<string, string | string[] | undefined>;

export const calendarDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toJSON()?.slice(0, 10) === value;

export function viewFilters(
  input: SearchParams,
  fields: Record<string, (value: string) => boolean>,
) {
  const filters = new URLSearchParams();
  for (const [field, valid] of Object.entries({
    ...fields,
    cursor: cursorToken,
  })) {
    const value = input[field];
    // Empty controls mean no filter. A cursor is an opaque backend token, not a control.
    if (value === undefined || (value === "" && field !== "cursor")) continue;
    if (typeof value !== "string" || !valid(value)) return null;
    filters.set(field, value);
  }
  return filters;
}

const cursorToken = (value: string) => /^[!-~]{1,256}$/.test(value);
