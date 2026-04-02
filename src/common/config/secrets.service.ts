/**
 * SecretsService
 * ─────────────
 * Production-grade abstraction over secret retrieval.
 *
 * Priority chain:
 *   1. AWS Secrets Manager          (if AWS_SECRETS_MANAGER_ENABLED=true)
 *   2. HashiCorp Vault              (if VAULT_ADDR + VAULT_TOKEN are set)
 *   3. ConfigService / process.env  (fallback, always works)
 *
 * Usage:
 *   constructor(private secrets: SecretsService) {}
 *   const dbUri = await this.secrets.get('MONGODB_URI');
 *
 * Register in AppModule (or any module that needs secrets):
 *   providers: [SecretsService]
 *   exports:   [SecretsService]
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly cache  = new Map<string, string>();

  // ── Optional AWS SDK (npm install @aws-sdk/client-secrets-manager) ────────
  private awsClient: any = null;

  // ── Optional node-vault (npm install node-vault) ──────────────────────────
  private vaultClient: any = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const awsEnabled   = this.config.get<string>('AWS_SECRETS_MANAGER_ENABLED') === 'true';
    const vaultAddr    = this.config.get<string>('VAULT_ADDR');
    const vaultToken   = this.config.get<string>('VAULT_TOKEN');

    if (awsEnabled) {
      try {
        // Lazy-load to keep the package optional
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

  /**
   * Retrieve a secret value by key.
   * Results are cached in-memory for the lifetime of the process.
   */
  async get(key: string, defaultValue?: string): Promise<string | undefined> {
    // ── In-memory cache ────────────────────────────────────────────────────
    if (this.cache.has(key)) return this.cache.get(key);

    let value: string | undefined;

    // ── 1. AWS Secrets Manager ─────────────────────────────────────────────
    if (this.awsClient) {
      value = await this.getFromAws(key);
    }

    // ── 2. HashiCorp Vault ─────────────────────────────────────────────────
    if (!value && this.vaultClient) {
      value = await this.getFromVault(key);
    }

    // ── 3. ConfigService / process.env fallback ───────────────────────────
    if (!value) {
      value = this.config.get<string>(key) ?? defaultValue;
    }

    if (value !== undefined) this.cache.set(key, value);
    return value;
  }

  /** Synchronous env-only access (for cases where async is not possible) */
  getSync(key: string, defaultValue?: string): string | undefined {
    return this.cache.get(key) ?? this.config.get<string>(key) ?? defaultValue;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getFromAws(key: string): Promise<string | undefined> {
    try {
      const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager' as any);
      const secretName = this.config.get<string>('AWS_SECRETS_MANAGER_PREFIX', '') + key;
      const response = await this.awsClient.send(new GetSecretValueCommand({ SecretId: secretName }));
      const raw = response.SecretString ?? response.SecretBinary?.toString('utf-8');
      if (!raw) return undefined;
      // If the secret is JSON (AWS stores multiple values per secret) try to parse
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' ? (parsed[key] ?? raw) : raw;
      } catch {
        return raw;
      }
    } catch (err: any) {
      // ResourceNotFoundException is normal — secret just isn't in AWS
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
      // KV v2 nests data under data.data; KV v1 uses data directly
      const data = result?.data?.data ?? result?.data ?? {};
      return data[key];
    } catch (err: any) {
      this.logger.warn(`Vault error for key "${key}": ${err?.message}`, 'SecretsService');
      return undefined;
    }
  }
}
