import { authService } from "../../src/services/auth.service.js";
import { organizationRepository } from "../../src/repositories/organization.repository.js";
import { refreshTokenRepository } from "../../src/repositories/refreshToken.repository.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mocked-token"),
  verify: jest.fn()
}));

jest.mock("../../src/repositories/organization.repository.js");
jest.mock("../../src/repositories/refreshToken.repository.js");
jest.mock("argon2");

describe("Auth Service", () => {

  test("should login successfully", async () => {

    const mockUser = {
      organization: {
        id: "org1",
        password_hash: "hashed"
      },
      actor: { id: "actor1" },
      system: {},
      environment: {}
    };

    (organizationRepository.findByEmailWithRelations as jest.Mock)
      .mockResolvedValue(mockUser);

    (argon2.verify as jest.Mock)
      .mockResolvedValue(true);

    (refreshTokenRepository.insert as jest.Mock)
      .mockResolvedValue({});

    const result = await authService.login("test@mail.com", "123");

    expect(result).toHaveProperty("accessToken");

  });

  test("should throw error if password incorrect", async () => {

    const mockUser = {
      organization: { password_hash: "hashed" },
      actor: {},
      system: {},
      environment: {}
    };

    (organizationRepository.findByEmailWithRelations as jest.Mock)
      .mockResolvedValue(mockUser);

    (argon2.verify as jest.Mock)
      .mockResolvedValue(false);

    await expect(
      authService.login("test@mail.com", "wrong")
    ).rejects.toThrow();

  });

  test("should throw error if user not found", async () => {

    (organizationRepository.findByEmailWithRelations as jest.Mock)
      .mockResolvedValue(null);

    await expect(
      authService.login("test@mail.com", "123")
    ).rejects.toThrow();

  });

  test("should generate new tokens using refresh token", async () => {

  const actor = { id: "actor1" };

  const refreshToken = "validtoken";

  (jwt.verify as jest.Mock).mockReturnValue({
    actor,
    refreshTokenId: "token123"
  });

  (refreshTokenRepository.deleteById as jest.Mock)
    .mockResolvedValue({});

  (organizationRepository.findByActorId as jest.Mock)
    .mockResolvedValue({ id: "org1" });

  (refreshTokenRepository.insert as jest.Mock)
    .mockResolvedValue({});

  const result = await authService.refresh(refreshToken);

  expect(result).toHaveProperty("accessToken");

});

});