import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { organizationRepository } from "../repositories/organization.repository.js";
import type { ActorModel, OrganizationModel } from "../types/models.js";
import Config from "../config.js";
import { AuthError } from "../errors/AuthError.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
import type { StringValue } from "ms";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type { RequestContext } from "../types/auth.js";
import { organizationService } from "./organization.services.js";
import { DataIntegrityError } from "../errors/DataIntegrity.js";

type RefreshTokenPayload = {
  actor: ActorModel;
  refreshTokenId: string;
};

const generateTokens = async (actor: ActorModel, organizationId: string) => {
  const accessToken = jwt.sign({ actor }, Config.JWT_ACCESS_SECRET, {
    expiresIn: `${Config.JWT_ACCESS_EXPIRES_MINS}Minutes` as StringValue,
  });

  const refreshTokenId = randomUUID();
  const refreshToken = jwt.sign(
    { actor, refreshTokenId },
    Config.JWT_REFRESH_SECRET,
    {
      expiresIn: `${Config.JWT_REFRESH_EXPIRES_DAYS}Days` as StringValue,
    },
  );

  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + Number(Config.JWT_REFRESH_EXPIRES_DAYS),
  );

  await refreshTokenRepository.insert({
    id: refreshTokenId,
    token: refreshToken,
    expires_at: expiresAt,
    organization_id: organizationId,
  });
  return { accessToken, refreshToken };
};

export const authService = {
  login: async (
    email: string,
    password: string,
  ): Promise<{
    organization: OrganizationModel;
    accessToken: string;
    refreshToken: string;
  }> => {
    const result = await organizationRepository.findByEmailWithRelations(email);

    if (
      !result ||
      !(await argon2.verify(result.organization.password_hash, password))
    ) {
      throw new AuthError();
    }

    return {
      organization: result.organization,
      ...(await generateTokens(result.actor, result.organization.id)),
    };
  },

  refresh: async (refreshToken: string) => {
    try {
      const { actor, refreshTokenId } = jwt.verify(
        refreshToken,
        Config.JWT_REFRESH_SECRET,
      ) as RefreshTokenPayload;

      await refreshTokenRepository.deleteById(refreshTokenId);

      const organization = await organizationRepository.findByActorId(actor.id);
      if (!organization) {
        throw new AuthError();
      }

      return await generateTokens(actor, organization.id);
    } catch (err) {
      if (err instanceof AppError && !(err instanceof NotFoundError)) {
        throw err;
      }

      throw new AuthError();
    }
  },

  logout: async (refreshToken: string) => {
    try {
      const { refreshTokenId } = jwt.verify(
        refreshToken,
        Config.JWT_REFRESH_SECRET,
      ) as RefreshTokenPayload;

      await refreshTokenRepository.deleteById(refreshTokenId);
    } catch (err) {
      if (err instanceof AppError && !(err instanceof NotFoundError)) {
        throw err;
      }
    }
  },

  getRequestContextOrThrow: async (
    accessToken: string,
  ): Promise<RequestContext> => {
    try {
      const payload = jwt.verify(accessToken, Config.JWT_ACCESS_SECRET) as {
        actor: ActorModel;
      };

      const models = await organizationService.getByActorIdWithEnvironments(
        payload.actor.id,
      );

      if (!models) {
        throw new DataIntegrityError(`Invalid actor=${payload.actor}`);
      }

      return {
        actor: payload.actor,
        organization: models.organization,
        environments: models.environments,
      };
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AuthError("Invalid access token", err);
      }

      throw err;
    }
  },
};
