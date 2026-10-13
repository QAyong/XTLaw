<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopChatWelcomeItem } from '@buddy-electron/shared/desktopApi'
import { computed } from 'vue'
import { resolveDesktopChatWelcomeText } from '@/shared/branding/welcome/desktopChatWelcomeVariants'
import { useWelcomeGreeting } from '@/shared/branding/welcome/useWelcomeGreeting'
import { BRAND_ASSET_URLS } from '@/shared/branding/brandAssets'

const props = defineProps<{
  language: BuddyLocale
  greetingEnabled: boolean
  variant: DesktopChatWelcomeItem | null
}>()

const title = computed(() => resolveDesktopChatWelcomeText(props.variant, props.language))
const greeting = useWelcomeGreeting(() => props.language, () => props.greetingEnabled)
</script>

<template>
  <section class="desktop-chat-welcome" :data-variant="variant?.id ?? 'none'">
    <img
      class="desktop-chat-welcome__wordmark desktop-chat-welcome__wordmark--light"
      :src="BRAND_ASSET_URLS.chatWelcomeWordmark.light"
      alt="XTLaw"
      draggable="false"
    >
    <img
      class="desktop-chat-welcome__wordmark desktop-chat-welcome__wordmark--dark"
      :src="BRAND_ASSET_URLS.chatWelcomeWordmark.dark"
      alt="XTLaw"
      draggable="false"
    >
    <div
      class="desktop-chat-welcome__heading"
      :data-has-title="!!title"
    >
      <h1 v-if="title">{{ title }}</h1>
      <p v-if="greeting" class="desktop-chat-welcome__greeting">{{ greeting }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-welcome {
  display: grid;
  width: min(calc(100% - 2.5rem), 44rem);
  justify-items: center;
  gap: 0.9rem;
  margin: 0 auto;
  text-align: center;
}

.desktop-chat-welcome__wordmark {
  width: clamp(10rem, min(32cqh, 28cqw), 14rem);
  max-width: 100%;
  height: auto;
  user-select: none;
}

.desktop-chat-welcome__wordmark--dark {
  display: none;
}

:global(:root[data-buddy-theme='dark'] .desktop-chat-welcome__wordmark--light) {
  display: none;
}

:global(:root[data-buddy-theme='dark'] .desktop-chat-welcome__wordmark--dark) {
  display: block;
}

.desktop-chat-welcome__greeting {
  margin: 0.5rem 0 0;
  color: var(--buddy-text-secondary);
  font-size: clamp(0.9rem, 2cqw, 1rem);
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
    font-size: clamp(1.15rem, 4cqw, 2.15rem);
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.3;
    text-rendering: optimizelegibility;
  }
}

@container task-pane (max-height: 620px) {
  .desktop-chat-welcome {
    gap: 0.65rem;
  }

  .desktop-chat-welcome__wordmark {
    width: min(12rem, 45cqw);
  }

  .desktop-chat-welcome__heading h1 {
    font-size: clamp(1.15rem, 4cqw, 1.6rem);
  }
}

@container welcome-region (max-height: 120px) {
  .desktop-chat-welcome__wordmark,
  :global(:root[data-buddy-theme='dark'] .desktop-chat-welcome__wordmark--dark) {
    display: none;
  }
}

@container welcome-region (max-height: 64px) {
  .desktop-chat-welcome {
    display: none;
  }
}
</style>
