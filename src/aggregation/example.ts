import { aggregatePublicData } from './engine.js';

const result = await aggregatePublicData();
console.log(JSON.stringify(result, null, 2));
if (result.errors.length > 0) process.exitCode = 1;
