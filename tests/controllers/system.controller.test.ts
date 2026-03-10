import { systemController } from "../../src/controllers/system.controller.js";
import { systemService } from "../../src/services/system.services.js";
import { mockRequest, mockResponse } from "../helpers/mockExpress.js";

jest.mock("../../src/services/system.services.js");

describe("System Controller", () => {

  test("should register system", async () => {

    const req = mockRequest({
      body: {
        name: "Test System",
        orgName: "Test Org",
        contactEmail: "test@mail.com",
        password: "123456"
      }
    });

    const res = mockResponse();

    (systemService.createProduction as jest.Mock).mockResolvedValue({
      organization: { name: "Test Org", email: "test@mail.com" },
      system: { id: "1", name: "Test System", created_on: new Date() },
      environment: { type: "production" }
    });

    await systemController.register(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(201);

  });

});