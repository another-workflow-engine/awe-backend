import { apiKeyController } from "../../src/controllers/apiKey.controller.js";
import { apiKeyService } from "../../src/services/apiKey.service.js";
import { mockRequest, mockResponse } from "../helpers/mockExpress.js";

jest.mock("../../src/services/apiKey.service.js");

describe("API Key Controller", () => {

  test("should list api keys", async () => {

    const req = mockRequest({
      actor: { id: "1", type: "ORGANIZATION_ACCOUNT" }
    });

    const res = mockResponse();

    (apiKeyService.getAll as jest.Mock).mockResolvedValue([]);

    await apiKeyController.list(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);

  });

  test("should generate new api key", async () => {

    const req = mockRequest({
      body: { label: "test key" },
      actor: { id: "1", type: "ORGANIZATION_ACCOUNT" }
    });

    const res = mockResponse();

    (apiKeyService.createNew as jest.Mock).mockResolvedValue({
      apiKey: { id: "1", label: "test", created_on: new Date() },
      rawKey: "prefix.secret"
    });

    await apiKeyController.generate(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(201);

  });

});