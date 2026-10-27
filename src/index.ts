import { readConfig } from './config.js';

console.log(JSON.stringify({ message: 'Backend foundation ready', ...readConfig() }));
