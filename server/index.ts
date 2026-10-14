import { app } from './app';
import { config } from './config';
import { assistantEnabled, warmAssistant } from './explain/llm';
import { assistantWarmList, stateStore } from './store';

const server = app.listen(config.port, () => {
  console.log(`SilentWatt API → http://localhost:${config.port}${config.prod ? ' (production)' : ''} · state: ${stateStore.kind}`);
  if (assistantEnabled) {
    console.log(`Assistant: ${config.llm.model} at ${config.llm.baseUrl}`);
    // Summaries are written in the background, one at a time; a click before that simply waits its turn.
    void warmAssistant(assistantWarmList('tr')).then((n) => console.log(`Assistant: ${n} case summaries ready`));
  }
});

// docker stop and the cloud's instance shutdown send SIGTERM: finish open requests and queued state writes first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close();
    void stateStore.close().finally(() => process.exit(0));
  });
}
