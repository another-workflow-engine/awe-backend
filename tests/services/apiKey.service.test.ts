import { apiKeyService } from "../../src/services/apiKey.service.js";
import { apiKeyRepository } from "../../src/repositories/apiKey.repository.js";
import { ActorTypes } from "../../src/types/enums.js";
import { environmentRepository } from "../../src/repositories/environment.repository.js";

jest.mock("../../src/repositories/environment.repository.js");
jest.mock("../../src/repositories/apiKey.repository.js");

describe("ApiKey Service", () => {

  test("should return api keys", async () => {

    (apiKeyRepository.findByOrganizationActorId as jest.Mock)
      .mockResolvedValue([]);

    const result = await apiKeyService.getAll({
      id: "1",
      type: ActorTypes.ORGANIZATION_ACCOUNT
    });

    expect(result).toEqual([]);

  });

  test("should throw error if actor is not organization", async () => {

    await expect(
      apiKeyService.getAll({
        id: "1",
        type: ActorTypes.API_KEY_CLIENT
      })
    ).rejects.toThrow();

  });

  test("should throw error if environment missing", async () => {

  (environmentRepository.findByOrganizationActorId as jest.Mock)
    .mockResolvedValue([]);

  await expect(
    apiKeyService.createNew("test", {
      id: "1",
      type: ActorTypes.ORGANIZATION_ACCOUNT
    })
  ).rejects.toThrow();

});

});