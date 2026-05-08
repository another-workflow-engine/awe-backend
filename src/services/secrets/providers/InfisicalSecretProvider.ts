import { InfisicalSDK, type Secret } from "@infisical/sdk";
import {
  BaseSecretProvider,
  type ProviderTestResult,
} from "./BaseSecretProvider.js";
import type { SecretProviderTypes } from "../../../types/enums.js";

export class InfisicalSecretProvider extends BaseSecretProvider<
  typeof SecretProviderTypes.INFISICAL
> {
  private async login(): Promise<InfisicalSDK> {
    const client = new InfisicalSDK({
      siteUrl: this.configuration.host,
    });

    return await client.auth().awsIamAuth.login({
      identityId: this.configuration.machineIdentityId,
    });
  }

  async testSecretExists(secretKey: string): Promise<ProviderTestResult> {
    try {
      const client = await this.login();
      await this.fetchSecret(client, secretKey);

      return {
        success: true,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err : undefined };
    }
  }

  private async fetchSecret(
    client: InfisicalSDK,
    secretKey: string,
  ): Promise<Secret> {
    return await client.secrets().getSecret({
      environment: this.configuration.environment,
      projectId: this.configuration.projectId,
      secretName: secretKey,
    });
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const client = await this.login();

      await client.folders().listFolders({
        environment: this.configuration.environment,
        projectId: this.configuration.projectId,
      });

      return {
        success: true,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err : undefined };
    }
  }

  async fetchSecrets(secretKeys: string[]): Promise<Record<string, string>> {
    const client = await this.login();

    const secrets = await Promise.all(
      secretKeys.map((key) => this.fetchSecret(client, key)),
    );

    return Object.fromEntries(
      secrets.map((secret) => [secret.secretKey, secret.secretValue]),
    );
  }

  async listAllSecretKeys(): Promise<string[]> {
    const client = await this.login();

    const response = await client.secrets().listSecrets({
      environment: this.configuration.environment,
      projectId: this.configuration.projectId,
      secretPath: "",
    });

    const allkeys = response.secrets.map((secret) => secret.secretKey);
    return allkeys;
  }
}
