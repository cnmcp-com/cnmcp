import { app, handleQueue, handleScheduled } from "./community/http";

export { ContainerProxy, StdioProbeContainer } from "./stdio-container";

type Bindings = CloudflareEnv;

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Bindings>;
