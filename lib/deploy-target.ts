export type DeployTarget = 'local' | 'vercel';

export function getDeployTarget(): DeployTarget {
  return process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'vercel' ? 'vercel' : 'local';
}

export function isAiEnabled(): boolean {
  return getDeployTarget() === 'local';
}
