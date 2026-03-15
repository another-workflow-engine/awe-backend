export const fetchService = {
  get: async (url: string, headers?: Record<string, string>): Promise<unknown> => {
    const response = await fetch(url, { method: "GET", headers: headers ?? {} });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
    }
    return response.json();
  },
};
