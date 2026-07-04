import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['activeTab', 'tabs', 'downloads', 'alarms', 'storage'],
    host_permissions: ['https://*.fbcdn.net/*'],
  },
});
