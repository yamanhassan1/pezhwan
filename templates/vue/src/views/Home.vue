<script setup lang="ts">
import { useAuth } from '@pezhwan/vue';

const { isAuthenticated, state } = useAuth();
</script>

<template>
  <section>
    <h1>Pezhwan Vue</h1>
    <p v-if="isAuthenticated">Signed in as {{ state.user?.email }}</p>
    <p v-else>Not signed in</p>
  </section>
</template>