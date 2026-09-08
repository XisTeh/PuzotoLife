import './server/environment.js';
import { initializeStorage } from './server/database/initialize.js';
import { createApp } from './server/index.js';
import { initializePrivateStorage } from './server/storage/privateFiles.js';

const app = createApp();
await initializeStorage();
await initializePrivateStorage();

export default app;
