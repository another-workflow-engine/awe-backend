import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import { z } from "zod";

const LoginInput = z.object({
  email: z.email(),
  password: z.string()
});

const TokenInput = z.object({
  refreshToken: z.string()
});

export const authController = {
  login: async (req: Request, res: Response) => {
    const { email, password } = LoginInput.parse(req.body);

    const { organization, system, accessToken, refreshToken } =
      await authService.login(email, password);

    res.status(200).json({
      system: {
        id: system.id,
        name: system.name,
        orgName: organization.name,
        contactEmail: organization.email
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
    const { refreshToken } = TokenInput.parse(req.body);
    await authService.logout(refreshToken);
    res.status(200).json({});
  },
};
