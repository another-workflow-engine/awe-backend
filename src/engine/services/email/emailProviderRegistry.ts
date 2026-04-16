import { EngineError } from "../../../errors/EngineError.js";
import {
  type EmailProvider,
  type EmailProviderType,
} from "./EmailProvider.js";
import { GoogleSmtpEmailProvider } from "./GoogleSmtpEmailProvider.js";

const providerRegistry: Record<EmailProviderType, EmailProvider> = {
  google_smtp: new GoogleSmtpEmailProvider(),
};

export function getEmailProvider(providerType: string): EmailProvider {
  const provider = providerRegistry[providerType as EmailProviderType];

  if (!provider) {
    throw new EngineError(
      `Email provider type '${providerType}' is not currently implemented`,
    );
  }

  return provider;
}
