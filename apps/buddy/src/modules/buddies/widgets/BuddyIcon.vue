<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'navigation' | 'toolbar' }>(), { variant: 'navigation' })
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="variant === 'toolbar' ? 1.2 : 1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="9.5" cy="8" r="3" />
    <path d="M4 20v-1a5.5 5.5 0 0 1 11 0v1" />
    <circle cx="17" cy="7" r="2.5" />
    <path d="M16.5 13.5A4.5 4.5 0 0 1 21 18v1.5" />
  </svg>
</template>
