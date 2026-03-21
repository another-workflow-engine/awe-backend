type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type RequestOptions = {
  body?: Record<string, unknown> | undefined;
  headers?: Record<string, string> | undefined;
};

const request = async (
  method: HttpMethod,
  url: string,
  options?: RequestOptions,
): Promise<unknown> => {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers ?? {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (err) {
    throw new Error(
      `Network error ${method.toLowerCase()} ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} ${method.toLowerCase()} ${url}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Response from ${url} was not valid JSON`);
  }
};

export const httpRequestService = {
  get: (url: string, headers?: Record<string, string>) =>
    request("GET", url, headers ? { headers } : undefined),

  post: (
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => request("POST", url, { body, ...(headers ? { headers } : {}) }),

  put: (
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => request("PUT", url, { body, ...(headers ? { headers } : {}) }),

  patch: (
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => request("PATCH", url, { body, ...(headers ? { headers } : {}) }),

  delete: (url: string, headers?: Record<string, string>) =>
    request("DELETE", url, headers ? { headers } : undefined),
};
