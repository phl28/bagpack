import { computed, createApp, defineComponent, reactive } from "vue";
import { render } from "@opentui/vue";

import { collectInventory } from "./collect";
import type {
  CollectionSummary,
  CollectionWarning,
  InventorySnapshot,
  PackageManager,
  PackageRecord,
  PackageStatus,
} from "./types";

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

const App = defineComponent({
  name: "BagpackTui",
  setup() {
    const state = reactive({
      summary: null as CollectionSummary | null,
      snapshot: null as InventorySnapshot | null,
      warnings: [] as CollectionWarning[],
      error: null as string | null,
      loading: true,
    });

    collectInventory()
      .then((summary) => {
        state.summary = summary;
        state.snapshot = summary.snapshot;
        state.warnings = summary.warnings;
      })
      .catch((err) => {
        state.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        state.loading = false;
      });

    const grouped = computed(() => {
      const base: Record<PackageManager, PackageRecord[]> = {
        brew: [],
        npm: [],
        pip: [],
      };

      if (!state.snapshot) {
        return base;
      }

      for (const pkg of state.snapshot.packages) {
        base[pkg.manager].push(pkg);
      }

      return base;
    });

    const formattedGeneratedAt = computed(() => {
      const value = state.snapshot?.generated_at;
      if (!value) return "Unknown";
      try {
        return new Date(value).toLocaleString();
      } catch (error) {
        return value;
      }
    });

    return {
      state,
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
      <template v-if="state.loading">
        <text fg="#a1a1aa">Collecting package data…</text>
      </template>
      <template v-else-if="state.error">
        <text fg="#ff7373">{{ state.error }}</text>
      </template>
      <template v-else>
        <group direction="vertical" gap="1">
          <box v-if="state.warnings.length" title="Warnings" padding="1" min-width="60">
            <group direction="vertical">
              <text v-for="warning in state.warnings" :key="warning.manager" fg="#ffcc80">
                {{ warning.manager.toUpperCase() }}: {{ warning.message }}
              </text>
            </group>
          </box>
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
      </template>
      <text fg="#a1a1aa">Press Ctrl+C to exit.</text>
    </group>
  `,
});

render(createApp(App));
