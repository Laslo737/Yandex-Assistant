import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
const PORT = process.env.PORT || 3002;

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`${env.app.name} running on 127.0.0.1:${PORT}`);
});
