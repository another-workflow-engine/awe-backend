export const fetchService = {
  get: async (
    url: string,
    headers?: Record<string, string>,
  ): Promise<unknown> => {
    const response = await fetch(url, {
      method: "GET",
      headers: headers ?? {},
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} fetching ${url}`,
      );
    }
    return response.json();
  },

  post: async (url: string, body: Record<string, unknown>) => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Network error posting to ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} posting to ${url}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new Error(`Response from ${url} was not valid JSON`);
    }
  },
};
