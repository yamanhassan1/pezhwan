<script setup lang="ts">
import { useAuth } from '@pezhwan/vue';

const { isAuthenticated } = useAuth();
</script>

<template>
  <header>
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/profile">Profile</RouterLink>
      <RouterLink v-if="!isAuthenticated" to="/login">Login</RouterLink>
      <RouterLink v-if="!isAuthenticated" to="/register">Register</RouterLink>
    </nav>
  </header>
  <main>
    <RouterView />
  </main>
</template>