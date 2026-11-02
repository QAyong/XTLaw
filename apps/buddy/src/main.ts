import { createApp } from 'vue'
import App from '@/App.vue'
import { blockBrowserHistoryMouseButtons } from '@/app/input/blockBrowserHistoryMouseButtons'
import { createDesktopRouter } from '@/app/router'
import { initializeDesktopFileIcons } from '@/theme/desktopFileIconState'
import { initializeDesktopTheme } from '@/theme/desktopThemeState'
import { applyDesktopTypography } from '@/theme/desktopTypography'
import '@/theme/index.scss'
import 'virtual:uno.css'

const stopIcons = initializeDesktopFileIcons()
const stopTheme = initializeDesktopTheme()
const stopHistoryMouse = blockBrowserHistoryMouseButtons()
applyDesktopTypography()
if (import.meta.hot) {
  import.meta.hot.dispose(stopIcons)
  import.meta.hot.dispose(stopTheme)
  import.meta.hot.dispose(stopHistoryMouse)
}

createApp(App)
  .use(createDesktopRouter())
  .mount('#app')
