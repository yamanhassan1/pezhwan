<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@pezhwan/vue';

const router = useRouter();
const { register, isLoading, state } = useAuth();
const form = reactive({ email: '', password: '' });

async function onSubmit() {
  try {
    await register({ email: form.email, password: form.password });
    router.push('/profile');
  } catch {
    // error surfaced via state.error
  }
}
</script>

<template>
  <main>
    <h1>Create an account</h1>
    <form @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="form.email" type="email" required />
      </label>
      <label>
        Password
        <input v-model="form.password" type="password" required />
      </label>
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Creating account…' : 'Register' }}
      </button>
    </form>
    <p v-if="state.error" role="alert">{{ state.error }}</p>
  </main>
</template>