import {
  CollectionSummary,
  CollectionWarning,
  InventorySnapshot,
  PackageManager,
  PackageRecord,
  PackageStatus,
} from "./types";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCommand(
  program: string,
  args: string[],
  allowedExitCodes: number[] = [0],
): Promise<CommandResult> {
  const subprocess = Bun.spawn([program, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const code = await subprocess.exited;
  const stdout = subprocess.stdout
    ? await new Response(subprocess.stdout).text()
    : "";
  const stderr = subprocess.stderr
    ? await new Response(subprocess.stderr).text()
    : "";

  if (!allowedExitCodes.includes(code)) {
    throw new Error(
      `${program} ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`,
    );
  }

  return { code, stdout, stderr };
}

async function collectBrew(): Promise<PackageRecord[]> {
  const list = await runCommand("brew", ["list", "--versions"]);
  const installed = new Map<string, string>();

  for (const line of list.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const version = parts[parts.length - 1];
    installed.set(name, version);
  }

  if (!installed.size) return [];

  const outdated = await runCommand("brew", ["outdated", "--json=v2"]);
  const outdatedMap = new Map<string, string>();

  if (outdated.stdout.trim()) {
    type BrewFormula = {
      name: string;
      installed_versions?: string[];
      current_version?: string;
      latest_version?: string;
    };

    type BrewOutdated = {
      formulae: BrewFormula[];
    };

    try {
      const parsed = JSON.parse(outdated.stdout) as BrewOutdated;
      for (const formula of parsed.formulae ?? []) {
        const latest =
          formula.latest_version || formula.current_version || null;
        if (formula.name && latest) {
          outdatedMap.set(formula.name, latest);
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse brew outdated JSON: ${String(error)}`);
    }
  }

  return Array.from(installed.entries()).map(([name, current_version]) => {
    const latest_version = outdatedMap.get(name) ?? null;
    const status: PackageStatus = latest_version && latest_version !== current_version
      ? "outdated"
      : "current";

    return {
      name,
      current_version,
      latest_version,
      installed_at: null,
      status,
      manager: "brew",
    };
  });
}

async function collectNpm(): Promise<PackageRecord[]> {
  const list = await runCommand("npm", ["ls", "-g", "--depth=0", "--json"]);
  type NpmTree = {
    dependencies?: Record<string, { version?: string } | undefined>;
  };

  let dependencies: Record<string, { version?: string } | undefined> = {};
  try {
    const parsed = JSON.parse(list.stdout) as NpmTree;
    dependencies = parsed.dependencies ?? {};
  } catch (error) {
    throw new Error(`Failed to parse npm ls JSON: ${String(error)}`);
  }

  const outdated = await runCommand("npm", ["outdated", "-g", "--json"], [0, 1]);
  const outdatedMap = new Map<string, string>();
  if (outdated.stdout.trim()) {
    try {
      const parsed = JSON.parse(outdated.stdout) as Record<
        string,
        { latest?: string }
      >;
      for (const [name, details] of Object.entries(parsed)) {
        if (details?.latest) {
          outdatedMap.set(name, details.latest);
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse npm outdated JSON: ${String(error)}`);
    }
  }

  const packages: PackageRecord[] = [];
  for (const [name, pkg] of Object.entries(dependencies)) {
    if (!pkg?.version) continue;
    const latest_version = outdatedMap.get(name) ?? null;
    const status: PackageStatus = latest_version ? "outdated" : "current";
    packages.push({
      name,
      current_version: pkg.version,
      latest_version,
      installed_at: null,
      status,
      manager: "npm",
    });
  }

  return packages;
}

async function collectPip(): Promise<PackageRecord[]> {
  const list = await runCommand("pip", ["list", "--format=json"]);
  type PipPackage = { name: string; version: string };
  let installed: PipPackage[] = [];
  try {
    installed = JSON.parse(list.stdout) as PipPackage[];
  } catch (error) {
    throw new Error(`Failed to parse pip list JSON: ${String(error)}`);
  }

  const outdated = await runCommand("pip", ["list", "--outdated", "--format=json"]);
  type PipOutdated = { name: string; latest_version: string };
  const outdatedMap = new Map<string, string>();
  if (outdated.stdout.trim()) {
    try {
      const parsed = JSON.parse(outdated.stdout) as PipOutdated[];
      for (const pkg of parsed) {
        outdatedMap.set(pkg.name, pkg.latest_version);
      }
    } catch (error) {
      throw new Error(`Failed to parse pip outdated JSON: ${String(error)}`);
    }
  }

  return installed.map((pkg) => {
    const latest_version = outdatedMap.get(pkg.name) ?? null;
    const status: PackageStatus = latest_version ? "outdated" : "current";
    return {
      name: pkg.name,
      current_version: pkg.version,
      latest_version,
      installed_at: null,
      status,
      manager: "pip",
    };
  });
}

export async function collectInventory(): Promise<CollectionSummary> {
  const snapshot: InventorySnapshot = {
    generated_at: new Date().toISOString(),
    packages: [],
  };
  const warnings: CollectionWarning[] = [];

  const handlers: Array<{
    manager: PackageManager;
    runner: () => Promise<PackageRecord[]>;
  }> = [
    { manager: "brew", runner: collectBrew },
    { manager: "npm", runner: collectNpm },
    { manager: "pip", runner: collectPip },
  ];

  for (const { manager, runner } of handlers) {
    try {
      const packages = await runner();
      snapshot.packages.push(...packages);
    } catch (error) {
      warnings.push({
        manager,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { snapshot, warnings };
}
