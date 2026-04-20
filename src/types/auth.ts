import type {
  ActorModel,
  EnvironmentModel,
  OrganizationModel,
} from "./models.js";

export type RequestContext = {
  actor: ActorModel;
  organization: OrganizationModel;
  environments: EnvironmentModel[];
};
