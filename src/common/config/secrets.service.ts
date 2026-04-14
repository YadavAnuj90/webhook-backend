
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly cache  = new Map<string, string>();

  private awsClient: any = null;

  private vaultClient: any = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const awsEnabled   = this.config.get<string>('AWS_SECRETS_MANAGER_ENABLED') === 'true';
    const vaultAddr    = this.config.get<string>('VAULT_ADDR');
    const vaultToken   = this.config.get<string>('VAULT_TOKEN');

    if (awsEnabled) {
      try {

        const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager' as any);
        this.awsClient = new SecretsManagerClient({
          region: this.config.get('AWS_REGION', 'ap-south-1'),
        });
        this.logger.log('✅ AWS Secrets Manager client initialised', 'SecretsService');
      } catch {
        this.logger.warn(
          '⚠️  AWS_SECRETS_MANAGER_ENABLED=true but @aws-sdk/client-secrets-manager is not installed. ' +
          'Falling back to env vars. Run: npm install @aws-sdk/client-secrets-manager',
          'SecretsService',
        );
      }
    }

    if (vaultAddr && vaultToken) {
      try {
        const vault = await import('node-vault' as any);
        this.vaultClient = vault.default({ endpoint: vaultAddr, token: vaultToken });
        this.logger.log('✅ HashiCorp Vault client initialised', 'SecretsService');
      } catch {
        this.logger.warn(
          '⚠️  VAULT_ADDR and VAULT_TOKEN are set but node-vault is not installed. ' +
          'Falling back to env vars. Run: npm install node-vault',
          'SecretsService',
        );
      }
    }
  }

  async get(key: string, defaultValue?: string): Promise<string | undefined> {

    if (this.cache.has(key)) return this.cache.get(key);

    let value: string | undefined;

    if (this.awsClient) {
      value = await this.getFromAws(key);
    }

    if (!value && this.vaultClient) {
      value = await this.getFromVault(key);
    }

    if (!value) {
      value = this.config.get<string>(key) ?? defaultValue;
    }

    if (value !== undefined) this.cache.set(key, value);
    return value;
  }

  getSync(key: string, defaultValue?: string): string | undefined {
    return this.cache.get(key) ?? this.config.get<string>(key) ?? defaultValue;
  }

  private async getFromAws(key: string): Promise<string | undefined> {
    try {
      const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager' as any);
      const secretName = this.config.get<string>('AWS_SECRETS_MANAGER_PREFIX', '') + key;
      const response = await this.awsClient.send(new GetSecretValueCommand({ SecretId: secretName }));
      const raw = response.SecretString ?? response.SecretBinary?.toString('utf-8');
      if (!raw) return undefined;

      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' ? (parsed[key] ?? raw) : raw;
      } catch {
        return raw;
      }
    } catch (err: any) {

      if (err?.name !== 'ResourceNotFoundException') {
        this.logger.warn(`AWS Secrets Manager error for key "${key}": ${err?.message}`, 'SecretsService');
      }
      return undefined;
    }
  }

  private async getFromVault(key: string): Promise<string | undefined> {
    try {
      const vaultPath = this.config.get<string>('VAULT_SECRET_PATH', 'secret/data/webhookos');
      const result    = await this.vaultClient.read(vaultPath);

      const data = result?.data?.data ?? result?.data ?? {};
      return data[key];
    } catch (err: any) {
      this.logger.warn(`Vault error for key "${key}": ${err?.message}`, 'SecretsService');
      return undefined;
    }
  }
}
