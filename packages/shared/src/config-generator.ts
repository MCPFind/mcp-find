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
      // Use stderr to avoid corrupting MCP stdio transport
      console.error(`Unknown package type: ${packageType}, defaulting to npm`);
      return { command: 'npx', args: ['-y', packageName, ...additionalArgs] };
  }
}

export function generateConfig(input: ConfigInput, client: ClientType): ConfigOutput {
  const clientConfig = CLIENT_CONFIGS[client];
  const { command, args } = buildCommand(input.packageName, input.packageType, input.additionalArgs);

  const serverEntry: Record<string, unknown> = { command, args };

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
