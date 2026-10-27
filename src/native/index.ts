import { startServer } from '../runtime.js';
import { createNativeServer } from './server.js';

startServer(createNativeServer());
