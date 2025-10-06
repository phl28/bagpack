import { computed, createApp, defineComponent, reactive } from "vue";
import { render } from "@opentui/vue";

export type PackageStatus = "current" | "outdated" | "unknown";
export type PackageManager = "brew" | "npm" | "pip";

export interface PackageRecord {
  name: string;
  current_version: string;
  latest_version: string | null;
  installed_at: string | null;
  status: PackageStatus;
  manager: PackageManager;
}

export interface InventorySnapshot {
  generated_at?: string | null;
  packages: PackageRecord[];
}

const managerLabels: Record<PackageManager, string> = {
  brew: "Homebrew",
  npm: "npm (global)",
  pip: "pip (system)",
};

const statusColors: Record<PackageStatus, string> = {
  current: "#7de5ff",
  outdated: "#f97316",
  unknown: "#a1a1aa",
};

const demoSnapshot: InventorySnapshot = {
  generated_at: new Date().toISOString(),
  packages: [
    {
      name: "wget",
      current_version: "1.24.5",
      latest_version: "1.24.6",
      installed_at: "2024-09-17T08:22:00Z",
      status: "outdated",
      manager: "brew",
    },
    {
      name: "typescript",
      current_version: "5.5.2",
      latest_version: "5.6.3",
      installed_at: "2025-02-11T15:10:30Z",
      status: "current",
      manager: "npm",
    },
    {
      name: "requests",
      current_version: "2.32.3",
      latest_version: null,
      installed_at: null,
      status: "unknown",
      manager: "pip",
    },
  ],
};

const App = defineComponent({
  name: "BagpackTui",
  setup() {
    const snapshot = reactive(demoSnapshot);

    const grouped = computed(() => {
      return snapshot.packages.reduce<Record<PackageManager, PackageRecord[]>>(
        (acc, pkg) => {
          acc[pkg.manager].push(pkg);
          return acc;
        },
        {
          brew: [],
          npm: [],
          pip: [],
        },
      );
    });

    const formattedGeneratedAt = computed(() => {
      return snapshot.generated_at
        ? new Date(snapshot.generated_at).toLocaleString()
        : "Unknown";
    });

    return {
      grouped,
      formattedGeneratedAt,
      managerLabels,
      statusColors,
    };
  },
  template: `
    <group direction="vertical" gap="1" padding="1">
      <text fg="#7de5ff">
        Bagpack Inventory · {{ formattedGeneratedAt }}
      </text>
      <text fg="#a1a1aa">Press Ctrl+C to exit.</text>
      <group gap="1">
        <box
          v-for="(packages, manager) in grouped"
          :key="manager"
          :title="managerLabels[manager] + ' (' + packages.length + ')'"
          padding="1"
          min-width="32"
        >
          <group direction="vertical">
            <template v-if="packages.length">
              <group v-for="pkg in packages" :key="pkg.manager + '-' + pkg.name">
                <text fg="#ffffff">{{ pkg.name }}</text>
                <text :fg="statusColors[pkg.status]">{{ pkg.status.toUpperCase() }}</text>
              </group>
            </template>
            <text v-else fg="#71717a">No packages recorded.</text>
          </group>
        </box>
      </group>
    </group>
  `,
});

render(createApp(App));
