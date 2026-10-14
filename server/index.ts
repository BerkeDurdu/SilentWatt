import { app } from './app';
import { config } from './config';
import { stateStore } from './store';

const server = app.listen(config.port, () => {
  console.log(`SilentWatt API → http://localhost:${config.port}${config.prod ? ' (production)' : ''} · state: ${stateStore.kind}`);
});

// docker stop and the cloud's instance shutdown send SIGTERM: finish open requests and queued state writes first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close();
    void stateStore.close().finally(() => process.exit(0));
  });
}
