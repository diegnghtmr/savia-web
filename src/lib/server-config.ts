import "server-only";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Every value the server boundary needs to reach the backend and Supabase.
 *
 * ADR-0018 keeps the HTTP boundary on the server, so none of these values may
 * be exposed to the browser. That is why no name carries the browser-visible
 * Next.js prefix and why the module is marked `server-only`.
 */
export class ServerConfig {
  private constructor(
    public readonly backendBaseUrl: URL,
    public readonly supabaseUrl: URL,
    public readonly supabaseAnonKey: string,
  ) {}

  public static fromEnvironment(environment: Environment): ServerConfig {
    const backendBaseUrl = parseWebUrl(
      environment.BACKEND_BASE_URL,
      "BACKEND_BASE_URL",
    );
    const supabaseUrl = parseWebUrl(environment.SUPABASE_URL, "SUPABASE_URL");
    const supabaseAnonKey = requireNonEmpty(
      environment.SUPABASE_ANON_KEY,
      "SUPABASE_ANON_KEY",
    );
    return new ServerConfig(backendBaseUrl, supabaseUrl, supabaseAnonKey);
  }
}

/**
 * Reads the process environment on call, never at module evaluation, so that
 * importing this module never requires real deployment values.
 */
export function loadServerConfig(): ServerConfig {
  return ServerConfig.fromEnvironment(process.env);
}

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  throw new Error(`Server configuration ${name} must be a non-empty string.`);
}

// HTTP is accepted alongside HTTPS because the backend's documented local
// server is `http://127.0.0.1:3000`; the scheme is still pinned so a bare host
// or a non-web scheme cannot silently become a request target.
function parseWebUrl(value: string | undefined, name: string): URL {
  const raw = requireNonEmpty(value, name);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("unsupported scheme");
    return url;
  } catch {
    throw new Error(
      `Server configuration ${name} must be an absolute HTTP or HTTPS URL.`,
    );
  }
}
