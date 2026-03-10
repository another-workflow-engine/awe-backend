import type { Request, Response } from "express";

export const mockRequest = (data: any = {}): Partial<Request> => ({
  body: data.body || {},
  params: data.params || {},
  headers: data.headers || {},
  query: data.query || {},
  actor: data.actor,
});

export const mockResponse = (): Partial<Response> => {
  const res: any = {};

  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  });

  res.json = jest.fn((data: any) => {
    res._body = data;
    return res;
  });

  res.send = jest.fn((data: any) => {
    res._body = data;
    return res;
  });

  return res as Partial<Response>;
};
