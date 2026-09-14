<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuth } from '../composables/useAuth';

const props = withDefaults(
  defineProps<{
    fallbackPath?: string;
  }>(),
  { fallbackPath: '/login' },
);

const { isAuthenticated, isLoading } = useAuth();

onMounted(() => {
  if (!isLoading.value && !isAuthenticated.value) {
    window.location.assign(props.fallbackPath);
  }
});
</script>

<template>
  <slot v-if="isAuthenticated" />
</template>
