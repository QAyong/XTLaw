import { z } from 'zod'

export const managedCapabilityStateSchema = z.enum(['enabled', 'disabled', 'removed', 'unavailable'])
export const managedCapabilityUnavailableReasonSchema = z.enum(['authentication_required', 'target_changed', 'dependency_unavailable'])
export const managedCapabilitySourceSchema = z.object({
  extensionId: z.string().min(1),
  extensionName: z.string().min(1),
  contributionId: z.string().min(1),
  revision: z.string().min(1),
  state: managedCapabilityStateSchema,
  userEnabled: z.boolean(),
  unavailableReason: managedCapabilityUnavailableReasonSchema.nullable(),
}).strict()

export type ManagedCapabilitySource = z.infer<typeof managedCapabilitySourceSchema>
export type ManagedCapabilityState = z.infer<typeof managedCapabilityStateSchema>
export type ManagedCapabilityUnavailableReason = z.infer<typeof managedCapabilityUnavailableReasonSchema>

export function isManagedCapabilityEnabled(source: ManagedCapabilitySource): boolean {
  return source.state === 'enabled' && source.userEnabled && source.unavailableReason === null
}
