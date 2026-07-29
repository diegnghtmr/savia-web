import { ServerConfig, loadServerConfig } from "../src/lib/server-config";

const valid = {
  BACKEND_BASE_URL: "https://api.savia.test",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
} as const;

describe("the server configuration", () => {
  it("reads every required variable from the injected environment", () => {
    const config = ServerConfig.fromEnvironment(valid);
    expect(config.backendBaseUrl.href).toBe("https://api.savia.test/");
    expect(config.supabaseUrl.href).toBe("https://project.supabase.co/");
    expect(config.supabaseAnonKey).toBe("anon-key");
  });

  it("accepts a plain HTTP backend so local development stays possible", () => {
    const config = ServerConfig.fromEnvironment({
      ...valid,
      BACKEND_BASE_URL: "http://127.0.0.1:3000",
    });
    expect(config.backendBaseUrl.href).toBe("http://127.0.0.1:3000/");
  });

  it.each(["BACKEND_BASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"] as const)(
    "names %s when it is absent",
    (name) => {
      expect(() =>
        ServerConfig.fromEnvironment({ ...valid, [name]: undefined }),
      ).toThrow(`Server configuration ${name} must be a non-empty string.`);
    },
  );

  it.each(["BACKEND_BASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"] as const)(
    "names %s when it is blank",
    (name) => {
      expect(() =>
        ServerConfig.fromEnvironment({ ...valid, [name]: "   " }),
      ).toThrow(`Server configuration ${name} must be a non-empty string.`);
    },
  );

  it.each(["BACKEND_BASE_URL", "SUPABASE_URL"] as const)(
    "names %s when it is not an absolute URL",
    (name) => {
      expect(() =>
        ServerConfig.fromEnvironment({ ...valid, [name]: "/v1/onboarding" }),
      ).toThrow(
        `Server configuration ${name} must be an absolute HTTP or HTTPS URL.`,
      );
    },
  );

  it.each(["BACKEND_BASE_URL", "SUPABASE_URL"] as const)(
    "names %s when its scheme is not HTTP or HTTPS",
    (name) => {
      expect(() =>
        ServerConfig.fromEnvironment({ ...valid, [name]: "ftp://savia.test" }),
      ).toThrow(
        `Server configuration ${name} must be an absolute HTTP or HTTPS URL.`,
      );
    },
  );

  it("reads the process environment only when it is asked to", () => {
    vi.stubEnv("BACKEND_BASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    expect(() => loadServerConfig()).toThrow(
      "Server configuration BACKEND_BASE_URL must be a non-empty string.",
    );
    vi.stubEnv("BACKEND_BASE_URL", valid.BACKEND_BASE_URL);
    vi.stubEnv("SUPABASE_URL", valid.SUPABASE_URL);
    vi.stubEnv("SUPABASE_ANON_KEY", valid.SUPABASE_ANON_KEY);
    expect(loadServerConfig().supabaseAnonKey).toBe("anon-key");
    vi.unstubAllEnvs();
  });
});
