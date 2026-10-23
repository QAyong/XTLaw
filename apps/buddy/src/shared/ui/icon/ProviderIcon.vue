<script setup lang="ts">
import { computed } from 'vue'
import ModelIcon from './ModelIcon.vue'
import { resolveProviderIcon } from './providerIcons'

const props = defineProps<{
  providerId: string
}>()

const iconUrl = computed(() => resolveProviderIcon(props.providerId))
const maskStyle = computed(() => iconUrl.value
  ? { '--provider-icon-mask': `url("${iconUrl.value}")` }
  : undefined)
</script>

<template>
  <!-- Decorative: the adjacent provider name already supplies the accessible label. -->
  <span class="provider-icon" aria-hidden="true">
    <span v-if="iconUrl" class="provider-icon__brand" :style="maskStyle" />
    <ModelIcon v-else class="provider-icon__fallback" />
  </span>
</template>

<style scoped>
.provider-icon {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--buddy-text-primary);
}

.provider-icon__brand,
.provider-icon__fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.provider-icon__brand {
  background-color: currentColor;
  mask: var(--provider-icon-mask) center / contain no-repeat;
  mask-mode: alpha;
  -webkit-mask: var(--provider-icon-mask) center / contain no-repeat;
}
</style>
