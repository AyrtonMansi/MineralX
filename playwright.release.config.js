import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:['release-workflows.spec.js','spatial-workflows.spec.js','ops-reconciliation.spec.js','ops-login.spec.js','ops-development.spec.js','workflow-upgrade.spec.js'],fullyParallel:false,workers:1,retries:0,timeout:45000,
  reporter:[['list'],['json',{outputFile:'test-results/geology-release.json'}]],
  use:{baseURL:process.env.MINERALX_TEST_URL||'http://localhost:3000',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:process.env.MINERALX_TEST_URL?undefined:{command:'npm start',url:'http://localhost:3000/mineralx',reuseExistingServer:!process.env.CI,timeout:30000}
});
