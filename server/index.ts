import { app } from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`SilentWatt API → http://localhost:${config.port}${config.prod ? ' (production)' : ''}`);
});
