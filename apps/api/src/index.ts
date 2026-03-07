import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { recordingsRouter } from './routes/recordings.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { shareRouter } from './routes/share.js';
import { supabaseAdmin } from './lib/supabase.js';

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
});

await fastify.register(cookie);

fastify.decorate('authenticate', async function (request: any, reply: any) {
  const token = request.cookies['sb-access-token'];
  
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  request.user = user;
});

await fastify.register(authRouter, { prefix: '/auth' });
await fastify.register(recordingsRouter, { prefix: '/recordings' });
await fastify.register(uploadRouter, { prefix: '/upload' });
await fastify.register(shareRouter, { prefix: '/share' });

fastify.get('/health', async () => ({ status: 'ok' }));

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`API server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
