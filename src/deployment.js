export class DeploymentConfigError extends Error {
  constructor(hostname) {
    super(`Cannot determine the GitHub account from ${hostname || 'this deployment'}. Sync is disabled on custom domains until an account can be configured explicitly.`);
    this.name = 'DeploymentConfigError';
    this.type = 'configuration';
    this.code = 'PAGES_OWNER_UNRESOLVED';
  }
}

export function pagesOwner(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase();
  const match = /^([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\.github\.io$/.exec(hostname);
  if (!match) throw new DeploymentConfigError(hostname);
  return match[1];
}

export function webappDataConfig(token, locationLike = globalThis.location) {
  return { owner: pagesOwner(locationLike), repo: 'webapp-data', branch: 'main', token };
}
