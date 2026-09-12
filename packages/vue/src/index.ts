/**
 * PEZHWAN — Vue 3 SDK entry.
 *
 * Exposes the plugin, the composables and the components from one import.
 */

export { pezhwan, usePezhwanConfig, getActiveConfig, type PezhwanPluginOptions } from './plugin';
export { useAuth, bootstrapAuth, type AuthState, type PezhwanUser, type PezhwanConfig } from './composables/useAuth';
export { useMFA, type MfaSetupResult, type MfaLoginResult } from './composables/useMFA';
export { useSession, loadSessions, type PezhwanSession } from './composables/useSession';

export { default as LoginForm } from './components/LoginForm.vue';
export { default as RegisterForm } from './components/RegisterForm.vue';
export { default as ProtectedRoute } from './components/ProtectedRoute.vue';