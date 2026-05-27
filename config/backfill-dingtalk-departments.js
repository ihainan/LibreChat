const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const mongoose = require('mongoose');
const { syncAllDingtalkUsers, ensureOrgTree } = require('@librechat/api');
const { createModels } = require('@librechat/data-schemas');
const connect = require('./connect');

const concurrency = Math.max(1, Number(process.argv[2]) || 3);

(async () => {
  try {
    await connect();
    createModels(mongoose);

    if (!process.env.DINGTALK_MCP_URL) {
      console.error('DINGTALK_MCP_URL is not set — aborting');
      process.exit(2);
    }

    console.log('Warming up org tree...');
    const tree = await ensureOrgTree();
    if (!tree || tree.size <= 1) {
      console.error('Org tree unavailable or empty — aborting');
      process.exit(3);
    }
    console.log(`Org tree ready: ${tree.size} departments`);

    console.log(`Backfilling DingTalk departments (concurrency=${concurrency})...`);
    const result = await syncAllDingtalkUsers(concurrency);
    console.log(
      `Done. total=${result.total} succeeded=${result.succeeded} failed=${result.failed}`,
    );
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();
