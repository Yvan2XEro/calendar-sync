export type ProviderStatus = "draft" | "beta" | "active" | "deprecated";

export interface ImapAuthConfig {
  user: string;
  pass?: string;
  /** Optional OAuth2 access token */
  accessToken?: string;
  /** Optional OAuth2 refresh token */
  refreshToken?: string;
  /** Optional OAuth2 client id */
  clientId?: string;
  /** Optional OAuth2 client secret */
  clientSecret?: string;
  /** OAuth2 auth type descriptor */
  type?: string;
  /** Optional scope for OAuth flows */
  scope?: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: ImapAuthConfig;
  mailbox?: string;
  /** Additional provider specific settings */
  [key: string]: unknown;
}

export interface RuntimeConfig {
  cursor?: number | null;
  [key: string]: unknown;
}

export interface ProviderConfig {
  imap?: ImapConfig;
  runtime?: RuntimeConfig;
  [key: string]: unknown;
}

export interface ProviderRecord {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  status: ProviderStatus;
  config: ProviderConfig;
}
