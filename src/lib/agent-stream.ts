import "server-only";

import { dataId } from "./data-access";
import { record } from "./insights-gateway";

export async function agentAnswer(response: Response) {
  const type = response.headers.get("content-type") ?? "";
  if (!/^text\/event-stream(?:\s*;|$)/i.test(type)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let run: string | null = null;
  let answer = "";
  let approvalHref: string | undefined;
  let pending = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return null;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) return null;
      pending += decoder.decode(chunk.value, { stream: true });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop()!;
      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        const event = record(JSON.parse(data));
        const id = dataId(event?.runId);
        if (!event || !id || (run && run !== id)) return null;
        run = id;
        if (event.type === "run_failed") return null;
        if (event.type === "run_completed") return { answer, approvalHref };
        const payload = record(event.data);
        if (event.type === "text_delta" && typeof payload?.text === "string")
          answer += payload.text;
        if (event.type === "approval_required") {
          const approvalId = dataId(payload?.approvalId);
          approvalHref = approvalId ? `/approvals/${approvalId}` : "/approvals";
        }
      }
    }
  } catch {
    return null;
  } finally {
    void reader.cancel().catch(() => {});
  }
}
