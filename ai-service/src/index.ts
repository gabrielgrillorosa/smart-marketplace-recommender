import Fastify from 'fastify';

const fastify = Fastify({ logger: true });
const PORT = parseInt(process.env.AI_SERVICE_PORT ?? '3001', 10);

fastify.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`ai-service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
