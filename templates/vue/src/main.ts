import { createApp } from 'vue';
import { bootstrapAuth, pezhwan } from '@pezhwan/vue';
import App from './App.vue';
import router from './router';
import { pezhwanConfig } from './plugins/pezhwan';

createApp(App).use(pezhwan, pezhwanConfig).use(router).mount('#app');

// Restore a cached session (fetches /v1/users/me when one exists).
void bootstrapAuth();