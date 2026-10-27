import { createServer } from 'node:http';
import { createApp } from './app.js';
import { startServer } from './runtime.js';

startServer(createServer(createApp()));
