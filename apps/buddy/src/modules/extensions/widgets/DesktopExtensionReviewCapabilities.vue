<script setup lang="ts">
import type { ExtensionReview } from '@buddy-shared/extensions/extensionApi'
import { PlugConnected20Regular } from '@vicons/fluent'
import { computed } from 'vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { extensionLabels } from '../extensionLabels'
import DesktopExtensionSubagentReview from './DesktopExtensionSubagentReview.vue'

const props = defineProps<{
  review: ExtensionReview
  language: string
  busy: boolean
}>()
const labels = computed(() => extensionLabels(props.language))
const connectors = computed(() => props.review.manifest.contributes.mcpConnectors)
const agents = computed(() => props.review.manifest.contributes.subagents)
</script>

<template>
  <div v-if="connectors.length || agents.length" class="extension-review-capabilities mt-5 grid gap-5">
    <section v-if="agents.length" data-testid="extension-included-agents">
      <h3 class="m-0 mb-2.5 flex items-center gap-2 text-[13px] font-semibold leading-5 text-fg">
        {{ labels.reviewAgents }}
        <span class="text-[12px] font-normal text-muted">{{ agents.length }}</span>
      </h3>
      <ul class="extension-review-agent-grid m-0 grid list-none gap-3 p-0">
        <DesktopExtensionSubagentReview
          v-for="agent in agents" :key="agent.id"
          :agent="agent" :connectors="connectors" :skills="review.manifest.contributes.skills"
          :language="language" :disabled="busy"
        />
      </ul>
    </section>

    <section v-if="connectors.length" data-testid="extension-included-mcp">
      <h3 class="m-0 mb-2.5 flex items-center gap-2 text-[13px] font-semibold leading-5 text-fg">
        {{ labels.reviewMcp }}
        <span class="text-[12px] font-normal text-muted">{{ connectors.length }}</span>
      </h3>
      <ul class="m-0 grid list-none gap-2 p-0">
        <li v-for="connector in connectors" :key="connector.id" class="min-w-0 rounded-lg border border-solid border-border bg-surface px-3.5 py-3">
          <div class="flex items-start gap-2.5">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-subtle text-muted" aria-hidden="true">
              <DesktopIcon :component="PlugConnected20Regular" :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h4 class="m-0 text-[13px] font-semibold leading-5 text-fg [overflow-wrap:anywhere]">
                  {{ connector.name }}
                </h4>
                <span class="rounded bg-subtle px-1.5 py-0.5 text-[11px] leading-4 text-muted">
                  {{ labels.reviewMcpAuthentication[connector.authentication] }}
                </span>
                <span class="ml-auto text-[11px] leading-4 text-muted">{{ labels.reviewMcpDisabled }}</span>
              </div>
              <p class="m-0 mt-1 text-[12px] leading-[1.6] text-muted [overflow-wrap:anywhere]">
                {{ connector.url }}
              </p>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.extension-review-capabilities {
  container-type: inline-size;

  @container (min-width: 560px) {
    .extension-review-agent-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }
}
</style>
