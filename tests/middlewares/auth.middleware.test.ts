import { authenticateRequest } from "../../src/middlewares/auth.middleware";
import { authService } from "../../src/services/auth.service.js";
import { apiKeyService } from "../../src/services/apiKey.service.js";

jest.mock("../../src/services/auth.service.js");
jest.mock("../../src/services/apiKey.service.js");

describe("Auth Middleware", () => {
  test("should authenticate bearer token", async () => {
    const req: any = {
      headers: {
        authorization: "Bearer token",
      },
    };

    const res: any = {};
    const next = jest.fn();

    (authService.getActorOrThrow as jest.Mock).mockReturnValue({
      id: "actor1",
    });

    await authenticateRequest(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("should throw error if authorization header missing", async () => {
    const req: any = { headers: {} };
    const res: any = {};
    const next = jest.fn();

    await expect(authenticateRequest(req, res, next)).rejects.toThrow();
  });

  test("should authenticate api key", async () => {
    const req: any = {
      headers: {
        authorization: "ApiKey testkey",
      },
    };

    const res: any = {};
    const next = jest.fn();

    (apiKeyService.getActorOrThrow as jest.Mock).mockResolvedValue({ id: "1" });

    await authenticateRequest(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("should throw error for invalid authorization format", async () => {
    const req: any = {
      headers: {
        authorization: "InvalidHeader",
      },
    };

    const res: any = {};
    const next = jest.fn();

    await expect(authenticateRequest(req, res, next)).rejects.toThrow();
  });
});
