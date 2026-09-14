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
const { register, isAuthenticated, isLoading, state } = useAuth();

const email = ref('');
const password = ref('');
const metadata = ref<Record<string, string>>({});
const busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    await register({ email: email.value, password: password.value, metadata: metadata.value });
    props.onSuccess?.();
    emit('success');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="pezhwan-register" @submit.prevent="submit" aria-label="Register">
    <input v-model="email" type="email" placeholder="Email" required />
    <input v-model="password" type="password" placeholder="Password" minlength="8" required />
    <button type="submit" :disabled="isLoading || busy">Create account</button>
    <p v-if="state.error" class="pezhwan-error" role="alert">{{ state.error }}</p>
  </form>
</template>
