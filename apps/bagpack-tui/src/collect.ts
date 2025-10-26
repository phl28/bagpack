import {
  CollectionSummary,
  CollectionWarning,
  InventorySnapshot,
  PackageManager,
  PackageRecord,
  PackageStatus,
} from "./types";

type CustomEntry = {
  id: string;
  name: string;
  install_cmd: string;
  update_cmd: string;
  version_cmd?: string;
  version_regex?: string;
  last_updated_at?: string;
  notes?: string;
};

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

  const outdated = await runCommand("brew", ["outdated", "--json=v2"], [0, 1]);
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
    } catch (_error) {
      // Be tolerant: treat as no known outdated packages
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
    { manager: "custom", runner: collectCustom },
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

// ---------------- Custom (Others) ----------------

function homeDir(): string | null {
  return Bun.env.HOME ?? null;
}

function customStorePath(): string {
  const home = homeDir();
  if (!home) throw new Error("HOME not set");
  return `${home}/.bagpack/custom-packages.json`;
}

async function readFile(path: string): Promise<string> {
  try {
    return await Bun.file(path).text();
  } catch {
    return "";
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

async function loadCustomEntries(): Promise<CustomEntry[]> {
  const path = customStorePath();
  const content = await readFile(path);
  if (!content.trim()) return [];
  try {
    const arr = JSON.parse(content) as CustomEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveCustomEntries(entries: CustomEntry[]): Promise<void> {
  const path = customStorePath();
  await writeFile(path, JSON.stringify(entries, null, 2));
}

function parseVersion(output: string, regex?: string): string | null {
  if (regex) {
    try {
      const rx = new RegExp(regex);
      const m = output.match(rx);
      if (m && (m[1] || m[0])) return (m[1] ?? m[0]).trim();
    } catch {}
  }
  const line = output.split("\n").find((l) => l.trim());
  return line ? line.trim() : null;
}

async function runShell(cmd: string): Promise<CommandResult> {
  const p = Bun.spawn(["sh", "-lc", cmd], { stdout: "pipe", stderr: "pipe" });
  const code = await p.exited;
  const stdout = p.stdout ? await new Response(p.stdout).text() : "";
  const stderr = p.stderr ? await new Response(p.stderr).text() : "";
  return { code, stdout, stderr };
}

async function collectCustom(): Promise<PackageRecord[]> {
  const entries = await loadCustomEntries();
  const records: PackageRecord[] = [];
  for (const e of entries) {
    let current = "-";
    if (e.version_cmd) {
      try {
        const res = await runShell(e.version_cmd);
        if (res.code === 0) {
          const v = parseVersion(res.stdout, e.version_regex);
          if (v) current = v;
        }
      } catch {}
    }
    records.push({
      name: e.name,
      current_version: current,
      latest_version: null,
      installed_at: e.last_updated_at ?? null,
      status: "unknown",
      manager: "custom",
    });
  }
  return records;
}

export async function saveCustom(entry: Partial<CustomEntry> & { name: string; install_cmd: string; update_cmd: string }): Promise<void> {
  const entries = await loadCustomEntries();
  let id = (entry as CustomEntry).id?.trim() ?? "";
  if (!id) {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    id = `${slug}-${new Date().toISOString()}`;
  }
  const newEntry: CustomEntry = {
    id,
    name: entry.name,
    install_cmd: entry.install_cmd,
    update_cmd: entry.update_cmd,
    version_cmd: entry.version_cmd,
    version_regex: entry.version_regex,
    last_updated_at: undefined,
    notes: undefined,
  };
  const idx = entries.findIndex((e) => e.id === id);
  if (idx >= 0) entries[idx] = newEntry; else entries.push(newEntry);
  await saveCustomEntries(entries);
}

export async function upgradePackage(manager: PackageManager, name: string): Promise<CollectionSummary> {
  if (manager === "brew") {
    await runCommand("brew", ["upgrade", name]);
  } else if (manager === "npm") {
    await runCommand("npm", ["update", "-g", name], [0]);
  } else if (manager === "pip") {
    await runCommand("pip", ["install", "-U", name]);
  } else if (manager === "custom") {
    const entries = await loadCustomEntries();
    const e = entries.find((x) => x.name === name);
    if (!e) throw new Error(`custom entry not found: ${name}`);
    const res = await runShell(e.update_cmd);
    if (res.code !== 0) throw new Error(`update failed: ${res.stderr.trim()}`);
    e.last_updated_at = new Date().toISOString();
    await saveCustomEntries(entries);
  }
  return await collectInventory();
}

export async function upgradeAll(manager: PackageManager): Promise<CollectionSummary> {
  if (manager === "brew") {
    await runCommand("brew", ["upgrade"]);
  } else if (manager === "npm") {
    await runCommand("npm", ["update", "-g"], [0]);
  } else if (manager === "pip") {
    const out = await runCommand("pip", ["list", "--outdated", "--format=json"]);
    try {
      const items = JSON.parse(out.stdout) as Array<{ name: string }>;
      for (const it of items) {
        await runCommand("pip", ["install", "-U", it.name]);
      }
    } catch {}
  } else if (manager === "custom") {
    const entries = await loadCustomEntries();
    for (const e of entries) {
      const res = await runShell(e.update_cmd);
      if (res.code === 0) e.last_updated_at = new Date().toISOString();
    }
    await saveCustomEntries(entries);
  }
  return await collectInventory();
}
