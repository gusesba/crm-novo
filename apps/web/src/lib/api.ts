let csrfToken: string | undefined;
export function clearCsrf() {
  csrfToken = undefined;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    if (!csrfToken) {
      const response = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!response.ok)
        throw new ApiError(
          "Não foi possível iniciar a sessão. Verifique a API.",
          response.status,
        );
      csrfToken = (await response.json()).token;
    }
    headers.set("X-CSRF-TOKEN", csrfToken!);
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.location.assign("/login");
    const details = error.errors
      ? Object.values(error.errors).flat().join(" ")
      : null;
    throw new ApiError(
      details ||
        error.title ||
        error.message ||
        "Não foi possível concluir a operação.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
export const put = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(data) });
