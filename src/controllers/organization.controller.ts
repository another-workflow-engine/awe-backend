import type { Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { z } from "zod";
import { organizationService } from "../services/organization.services.js";

const RegisterOrganizationInput = z.object({
  name: z.string().max(255),
  orgName: z.string().max(255),
  contactEmail: z.email(),
  password: z.string(),
  description: z.string().nullable().optional(),
});

export const organizationController = {
  register: async (req: Request, res: Response) => {
    const data = RegisterOrganizationInput.parse(req.body);
    const { organization, environments } = await organizationService.register({
      name: data.orgName,
      email: data.contactEmail,
      password: data.password,
    });

    res.status(201).json({
      system: {
        id: organization.id,
        name: organization.name,
        orgName: organization.name,
        contactEmail: organization.email,
        environments: environments.map((env) => env.type),
        createdAt: organization.created_on,
      },
    });
  },

  me: async (req: Request, res: Response) => {
    const organization = req.context.organization;

    res.status(200).json({
      system: {
        id: "b8840793-c067-4dee-b392-4e0ea104bdfa",
        name: "none",
        orgName: organization.name,
        contactEmail: organization.email,
        createdAt: organization.created_on,
        updatedAt: organization.modified_on,
      },
    });
  },

  dashboard: async (req: Request, res: Response) => {
    const overview = await dashboardService.getOverview(
      req.context.actor,
      req.environmentIds,
    );

    res.status(200).json(overview);
  },
};
