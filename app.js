import './server/environment.js';
import express from 'express';
import { initializeStorage } from './server/database/initialize.js';
import { createApp } from './server/index.js';
import { initializePrivateStorage } from './server/storage/privateFiles.js';

const app = createApp(process.env, undefined, express());
await initializeStorage();
await initializePrivateStorage();

export default app;
