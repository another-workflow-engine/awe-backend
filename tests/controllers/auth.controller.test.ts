import { authController } from "../../src/controllers/auth.controller.js";
import { authService } from "../../src/services/auth.service.js";
import { mockRequest, mockResponse } from "../helpers/mockExpress.js";

jest.mock("../../src/services/auth.service.js");

describe("Auth Controller", () => {

  test("should login successfully", async () => {

    const req = mockRequest({
      body: {
        email: "test@mail.com",
        password: "123"
      }
    });

    const res = mockResponse();

    (authService.login as jest.Mock).mockResolvedValue({
      organization: {},
      system: {},
      environment: {},
      accessToken: "token",
      refreshToken: "refresh"
    });

    await authController.login(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);

  });

});