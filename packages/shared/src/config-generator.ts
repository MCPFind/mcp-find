import type { ClientType, ConfigOutput, PackageType } from './types';
import { CLIENT_CONFIGS } from './constants';

interface ConfigInput {
  slug: string;
  packageName: string;
  packageType: PackageType;
  additionalArgs?: string[];
  envVars?: { name: string; placeholder: string; required: boolean }[];
}

function buildCommand(packageName: string, packageType: PackageType, additionalArgs: string[] = []): {
  command: string;
  args: string[];
} {
  switch (packageType) {
    case 'npm':
      return { command: 'npx', args: ['-y', packageName, ...additionalArgs] };
    case 'pypi':
      return { command: 'uvx', args: [packageName, ...additionalArgs] };
    case 'docker':
      return { command: 'docker', args: ['run', '-i', '--rm', packageName, ...additionalArgs] };
    default:
      throw new Error(`Automatic configuration is unavailable for package type: ${packageType}. Follow the publisher's setup instructions.`);
  }
}

export function generateConfig(input: ConfigInput, client: ClientType): ConfigOutput {
  if (!input.packageName.trim()) throw new Error('A published package name is required to generate configuration.');
  const clientConfig = CLIENT_CONFIGS[client];
  const { command, args } = buildCommand(input.packageName, input.packageType, input.additionalArgs);

  // VS Code's MCP configuration reference requires the stdio discriminator:
  // https://code.visualstudio.com/docs/agents/reference/mcp-configuration
  const serverEntry: Record<string, unknown> = client === 'vscode'
    ? { type: 'stdio', command, args }
    : { command, args };

  // Add environment variables if present
  if (input.envVars && input.envVars.length > 0) {
    const env: Record<string, string> = {};
    for (const v of input.envVars) {
      env[v.name] = v.placeholder;
    }
    serverEntry.env = env;
  }

  // Build the full config object with client-specific top-level key
  const config: Record<string, unknown> = {
    [clientConfig.topLevelKey]: {
      [input.slug]: serverEntry,
    },
  };

  const placeholders = (input.envVars || [])
    .filter(v => v.required)
    .map(v => v.name);

  return {
    client,
    config,
    filePath: clientConfig.filePath,
    postInstall: clientConfig.postInstall,
    placeholders,
  };
}
