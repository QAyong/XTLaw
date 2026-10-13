<script setup lang="ts">
import type { DesktopChatWelcomeItem } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, shallowRef } from 'vue'
import { resolveDesktopChatWelcomeText } from '@/shared/branding/welcome/desktopChatWelcomeVariants'
import { useWelcomeGreeting } from '@/shared/branding/welcome/useWelcomeGreeting'
import { useDesktopTheme } from '@/theme/useDesktopTheme'

const props = defineProps<{
  greetingEnabled: boolean
  language: BuddyLocale
  variant: DesktopChatWelcomeItem | null
}>()

const { resolved } = useDesktopTheme()
const failedImage = shallowRef<string | null>(null)
const welcome = computed(() => resolved.value.document.welcome)
const custom = computed(() => welcome.value !== undefined)
const greeting = useWelcomeGreeting(() => props.language, () => props.greetingEnabled)
const heading = computed(() => custom.value
  ? welcome.value?.text?.[props.language] ?? ''
  : resolveDesktopChatWelcomeText(props.variant, props.language))
const illustration = computed(() => {
  const image = welcome.value?.image
  const url = image ? resolved.value.assets[image] : null
  return url && url !== failedImage.value ? url : null
})
</script>

<template>
  <section v-if="greeting || heading || illustration" class="desktop-chat-welcome grid w-[min(calc(100%_-_2.5rem),_44rem)] gap-[0.25rem] my-0 mx-auto text-center" :data-variant="custom ? 'theme' : variant?.id">
    <img
      v-if="illustration"
      class="desktop-chat-welcome__illustration w-[clamp(4rem,_min(20cqh,_40cqw),_12rem)] max-w-full mb-2 select-none"
      :src="illustration"
      alt=""
      draggable="false"
      @error="failedImage = illustration"
    >
    <div v-if="greeting" class="desktop-chat-welcome__greeting">
      <span>{{ greeting }}</span>
    </div>
    <div
      v-if="heading"
      class="desktop-chat-welcome__heading relative max-w-[calc(100%_-_2.5rem)]"
    >
      <h1>{{ heading }}</h1>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-welcome {
  justify-items: center;
}

.desktop-chat-welcome__greeting {
  color: var(--buddy-text-secondary);
  font-family: var(--buddy-font-ui);
  font-size: 0.92rem;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: 0.01em;
  margin-bottom: 0.35rem;
}

.desktop-chat-welcome__heading {
  display: inline-grid;
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
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
  }

  .desktop-chat-welcome__heading h1 {
    font-size: clamp(1.15rem, 2.5cqw, 1.45rem);
  }
}

@container task-pane (max-height: 340px) {
  .desktop-chat-welcome {
    display: none;
  }
}
</style>
