import type { InjectionKey } from 'vue'

export const sessionReferenceNavigationKey: InjectionKey<(id: string) => Promise<void>> = Symbol('session-reference-navigation')
