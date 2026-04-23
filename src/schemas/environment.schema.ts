import z from "zod";
import { EnvironmentTypes } from "../types/enums.js";

export const EnvironmentTypeSchema = z.enum(EnvironmentTypes);
