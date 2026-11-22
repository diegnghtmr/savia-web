import { calendarDate, type SearchParams } from "./view-filters";

export function insightsPeriod(input: SearchParams) {
  if (Object.keys(input).some((key) => key !== "from" && key !== "to"))
    return null;
  const { from, to } = input;
  if (from === undefined && to === undefined) {
    const today = new Date().toISOString().slice(0, 10);
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    !calendarDate(from) ||
    !calendarDate(to) ||
    from > to
  )
    return null;
  return { from, to };
}

export type InsightsPeriod = NonNullable<ReturnType<typeof insightsPeriod>>;
