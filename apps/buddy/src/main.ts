import { createApp } from 'vue'
import App from '@/App.vue'
import { createDesktopRouter } from '@/app/router'
import { applyDesktopTypography } from '@/theme/desktopTypography'
import '@/theme/index.scss'
import 'virtual:uno.css'

applyDesktopTypography()

createApp(App)
  .use(createDesktopRouter())
  .mount('#app')
