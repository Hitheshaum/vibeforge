import {
  InitResponse,
  ConnectUrlResponse,
  CheckConnectionResponse,
  GenerateResponse,
  PublishResponse,
  DestroyResponse,
  AppListItem,
  Blueprint,
  Environment,
} from '@aws-vibe/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
}

export const api = {
  async init(): Promise<InitResponse> {
    return fetchApi('/api/init');
  },

  async getConnectUrl(region: string): Promise<ConnectUrlResponse> {
    return fetchApi(`/api/connect-url?region=${region}`);
  },

  async checkConnection(accountId: string, region?: string): Promise<CheckConnectionResponse> {
    return fetchApi('/api/check', {
      method: 'POST',
      body: JSON.stringify({ accountId, region }),
    });
  },

  async generate(
    accountId: string,
    region: string,
    blueprint: Blueprint,
    prompt: string,
    appName: string
  ): Promise<GenerateResponse> {
    return fetchApi('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ accountId, region, blueprint, prompt, appName }),
    });
  },

  async publish(
    accountId: string,
    region: string,
    appId: string
  ): Promise<PublishResponse> {
    return fetchApi('/api/publish', {
      method: 'POST',
      body: JSON.stringify({ accountId, region, appId, confirm: true }),
    });
  },

  async listApps(): Promise<AppListItem[]> {
    return fetchApi('/api/apps');
  },

  async destroy(
    accountId: string,
    region: string,
    appId: string,
    env: Environment
  ): Promise<DestroyResponse> {
    return fetchApi('/api/destroy', {
      method: 'POST',
      body: JSON.stringify({ accountId, region, appId, env, confirm: true }),
    });
  },
};
