import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import { z } from "zod";

const LoginInput = z.object({
  email: z.email(),
  password: z.string(),
});

const TokenInput = z.object({
  refreshToken: z.string(),
});

const LogoutInput = z.object({
  refreshToken: z.string().optional(),
});

export const authController = {
  login: async (req: Request, res: Response) => {
    const { email, password } = LoginInput.parse(req.body);

    const { organization, accessToken, refreshToken } = await authService.login(
      email,
      password,
    );

    res.status(200).json({
      organization: {
        id: organization.id,
        name: organization.name,
        email: organization.email,
      },
      accessToken,
      refreshToken,
    });
  },

  refresh: async (req: Request, res: Response) => {
    const { refreshToken } = TokenInput.parse(req.body);
    res.status(200).json({
      ...(await authService.refresh(refreshToken)),
    });
  },

  logout: async (req: Request, res: Response) => {
    const { refreshToken } = LogoutInput.parse(req.body ?? {});

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.status(200).json({});
  },
};
