<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const props = withDefaults(
  defineProps<{
    onSuccess?: () => void;
  }>(),
  {},
);
const emit = defineEmits<{ success: [] }>();
const { login, isAuthenticated, isLoading, state } = useAuth();

const email = ref('');
const password = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    await login({ email: email.value, password: password.value });
    props.onSuccess?.();
    emit('success');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="pezhwan-login" @submit.prevent="submit" aria-label="Login">
    <input v-model="email" type="email" placeholder="Email" required />
    <input v-model="password" type="password" placeholder="Password" required />
    <button type="submit" :disabled="isLoading || busy">Sign in</button>
    <p v-if="state.error" class="pezhwan-error" role="alert">{{ state.error }}</p>
  </form>
</template>