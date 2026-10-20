import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false,
  workers:1,
  timeout:30000,
  reporter:[['list'],['json',{outputFile:'test-results/browser-results.json'}]],
  use:{baseURL:'http://127.0.0.1:3187',trace:'retain-on-failure',screenshot:'only-on-failure',channel:process.env.PLAYWRIGHT_CHANNEL||undefined},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'narrow',use:{viewport:{width:390,height:844},reducedMotion:'reduce'}}],
  webServer:{command:'npm run start -- --hostname 127.0.0.1 --port 3187',url:'http://127.0.0.1:3187',reuseExistingServer:!process.env.CI,timeout:90000},
});
