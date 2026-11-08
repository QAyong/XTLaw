<template>
  <span class="desktop-ring-spinner" aria-hidden="true" />
</template>

<style scoped>
.desktop-ring-spinner {
  display: block;
  width: 10px;
  height: 10px;
  flex: none;
  border: 1.5px solid var(--buddy-border-strong);
  border-top-color: var(--buddy-text-secondary);
  border-radius: 50%;
  animation: desktop-ring-spin 900ms linear infinite;
}

@keyframes desktop-ring-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-ring-spinner { animation: none; }
}
</style>
