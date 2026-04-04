import { HttpError } from "../errors/HttpError.js";
import type {
  HttpMethod,
  RequestOptions,
  HttpResponse,
  PathParameters,
} from "../types/http.js";

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

function buildUrl(path: string, params?: PathParameters): URL {
  const url = new URL(path);

  if (!params) {
    return url;
  }

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url;
}

export const httpService = {
  async request<TData, TBody = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions<TBody> = {},
  ): Promise<HttpResponse<TData>> {
    const { headers = {}, body, params, signal } = options;

    const url = buildUrl(path, params);

    const response = await fetch(url, {
      method,
      headers: { ...DEFAULT_HEADERS, ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });

    let data: TData;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      data = (await response.json()) as TData;
    } else {
      data = (await response.text()) as unknown as TData;
    }

    if (!response.ok) {
      throw new HttpError(response.statusText, data);
    }

    return { data, status: response.status, headers: response.headers };
  },

  /**
   * GET /path
   * @example const { data } = await httpService.get<User[]>("/users", { params: { role: "admin" } })
   */
  get<TData, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<HttpResponse<TData>> {
    return httpService.request<TData>("GET", path, options);
  },

  /**
   * POST /path
   * @example const { data } = await httpService.post<User, CreateUserDto>("/users", { body: { name: "Alice" } })
   */
  post<TData, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<HttpResponse<TData>> {
    return httpService.request<TData, TBody>("POST", path, options);
  },

  /**
   * PUT /path  (full replace)
   * @example const { data } = await httpService.put<User, UpdateUserDto>("/users/1", { body: { name: "Alice" } })
   */
  put<TData, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<HttpResponse<TData>> {
    return httpService.request<TData, TBody>("PUT", path, options);
  },

  /**
   * PATCH /path  (partial update)
   * @example const { data } = await httpService.patch<User, Partial<UpdateUserDto>>("/users/1", { body: { name: "Bob" } })
   */
  patch<TData, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<HttpResponse<TData>> {
    return httpService.request<TData, TBody>("PATCH", path, options);
  },

  /**
   * DELETE /path
   * @example await httpService.delete("/users/1")
   */
  delete<TData = void>(
    path: string,
    options?: Omit<RequestOptions, "body">,
  ): Promise<HttpResponse<TData>> {
    return httpService.request<TData>("DELETE", path, options);
  },
};
