<script setup lang="ts">
import type { DesktopChatWelcomeItem } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { resolveDesktopChatWelcomeText } from '@/shared/branding/welcome/desktopChatWelcomeVariants'
import { useWelcomeGreeting } from '@/shared/branding/welcome/useWelcomeGreeting'

const props = defineProps<{
  language: BuddyLocale
  greetingEnabled: boolean
  variant: DesktopChatWelcomeItem | null
}>()

const title = computed(() => resolveDesktopChatWelcomeText(props.variant, props.language))
const greeting = useWelcomeGreeting(() => props.language, () => props.greetingEnabled)
</script>

<template>
  <section v-if="greeting || title" class="desktop-chat-welcome" :data-variant="variant?.id ?? 'none'">
    <div v-if="greeting" class="desktop-chat-welcome__greeting">
      <span>{{ greeting }}</span>
    </div>
    <div v-if="title" class="desktop-chat-welcome__heading">
      <h1>{{ title }}</h1>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-welcome {
  display: grid;
  width: min(calc(100% - 2.5rem), 44rem);
  justify-items: center;
  gap: 0.25rem;
  margin: 0 auto;
  text-align: center;
}

.desktop-chat-welcome__greeting {
  margin-bottom: 0.35rem;
  color: var(--buddy-text-secondary);
  font-family: var(--buddy-font-ui);
  font-size: 0.92rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1.45;
}

.desktop-chat-welcome__heading {
  position: relative;
  display: inline-grid;
  max-width: calc(100% - 2.5rem);
  justify-items: center;

  h1 {
    margin: 0;
    color: var(--buddy-text-strong);
    font-family: var(--buddy-font-ui);
    font-size: clamp(1.4rem, 2.8cqw, 1.85rem);
    font-weight: 500;
    letter-spacing: 0;
    line-height: 1.35;
    overflow-wrap: anywhere;
    text-rendering: optimizelegibility;
  }
}

@container task-pane (max-height: 620px) {
  .desktop-chat-welcome__greeting {
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
  }

  .desktop-chat-welcome__heading h1 {
    font-size: clamp(1.15rem, 2.5cqw, 1.45rem);
  }
}

@container welcome-region (max-height: 64px) {
  .desktop-chat-welcome {
    display: none;
  }
}
</style>
