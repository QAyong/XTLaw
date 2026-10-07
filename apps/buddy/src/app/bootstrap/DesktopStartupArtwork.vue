<script setup lang="ts">
import { BRAND_ASSET_URLS } from '@/shared/branding/brandAssets'
</script>

<template>
  <div class="startup-art" aria-hidden="true">
    <div class="startup-art__wordmark">
      <img class="startup-art__wordmark-light" :src="BRAND_ASSET_URLS.chatWelcomeWordmark.light" alt="" width="2048" height="460" draggable="false" fetchpriority="high">
      <img class="startup-art__wordmark-dark" :src="BRAND_ASSET_URLS.chatWelcomeWordmark.dark" alt="" width="2048" height="460" draggable="false" fetchpriority="high">
    </div>
  </div>
</template>

<style scoped>
.startup-art {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.startup-art__wordmark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--startup-wordmark-width);
  aspect-ratio: 2048 / 460;
  translate: -50% -50%;
}

.startup-art__wordmark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.startup-art__wordmark img.startup-art__wordmark-dark {
  display: none;
}

:global(:root[data-buddy-theme='dark'] .startup-art__wordmark img.startup-art__wordmark-light) {
  display: none;
}

:global(:root[data-buddy-theme='dark'] .startup-art__wordmark img.startup-art__wordmark-dark) {
  display: block;
}
</style>
