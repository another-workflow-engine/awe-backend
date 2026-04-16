import type { Request, Response } from "express";
import { systemService } from "../services/system.services.js";
import { dashboardService } from "../services/dashboard.service.js";
import { z } from "zod";

const RegisterSystemInput = z.object({
  name: z.string().max(255),
  orgName: z.string().max(255),
  contactEmail: z.email(),
  password: z.string(),
  description: z.string().nullable().optional(),
});

export const systemController = {
  register: async (req: Request, res: Response) => {
    const data = RegisterSystemInput.parse(req.body);
    const { organization, system, environment } =
      await systemService.createProduction({
        organization: {
          name: data.orgName,
          email: data.contactEmail,
          password: data.password,
        },
        system: {
          name: data.name,
          ...(data.description !== undefined && {
            description: data.description,
          }),
        },
      });

    res.status(201).json({
      system: {
        id: system.id,
        name: system.name,
        orgName: organization.name,
        contactEmail: organization.email,
        environments: environment.map((env) => env.type),
        createdAt: system.created_on,
      },
    });
  },

  me: async (req: Request, res: Response) => {
    const { system, organization } =
      await systemService.getCurrentSystem(req.actor);

    res.status(200).json({
      system: {
        id: system.id,
        name: system.name,
        orgName: organization.name,
        contactEmail: organization.email,
        createdAt: system.created_on,
        updatedAt: system.modified_on,
      },
    });
  },

  dashboard: async (req: Request, res: Response) => {
    const overview = await dashboardService.getOverview(
      req.actor,
      req.environmentIds,
    );

    res.status(200).json(overview);
  },
};
