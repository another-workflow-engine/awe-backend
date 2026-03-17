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
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch {
      console.log(response);
      throw new Error("Response was not valid JSON");
    }
  },
};
