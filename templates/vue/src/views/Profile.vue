<script setup lang="ts">
import { useAuth } from '@pezhwan/vue';

const { state, logout, refreshProfile } = useAuth();
</script>

<template>
  <main>
    <h1>Profile</h1>
    <dl>
      <dt>ID</dt>
      <dd>{{ state.user?.id }}</dd>
      <dt>Email</dt>
      <dd>{{ state.user?.email }}</dd>
      <dt>Roles</dt>
      <dd>{{ state.user?.roles?.join(', ') || '—' }}</dd>
    </dl>
    <button type="button" @click="refreshProfile()">Refresh profile</button>
    <button type="button" @click="logout()">Sign out</button>
  </main>
</template>