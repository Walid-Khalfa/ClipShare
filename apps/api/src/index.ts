import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { recordingsRouter } from './routes/recordings.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { shareRouter } from './routes/share.js';
import { supabaseAdmin } from './lib/supabase.js';
import { checkRateLimit } from './lib/rate-limit.js';

const fastify = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024, // 1MB max request body size
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
});

await fastify.register(cookie);

// Global rate limit for auth endpoints: 5 requests per IP per hour
fastify.addHook('onRequest', async (request, reply) => {
  // Apply strict rate limiting to auth endpoints
  if (request.url.startsWith('/auth/magic-link') && request.method === 'POST') {
    const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    const rateLimit = await checkRateLimit(ip, '/auth/magic-link', { maxRequests: 5, windowSeconds: 3600 });
    
    if (!rateLimit.allowed) {
      reply.header('Retry-After', Math.ceil((rateLimit.resetAt?.getTime() || Date.now() + 3600000 - Date.now()) / 1000).toString());
      return reply.status(429).send({ error: 'Too many requests. Please try again later.' });
    }
  }
  
  // General API rate limit: 100 requests per minute per IP
  const publicEndpoints = ['/share/', '/health'];
  const isPublicEndpoint = publicEndpoints.some(endpoint => request.url.startsWith(endpoint));
  
  if (!isPublicEndpoint && !request.url.startsWith('/auth/')) {
    const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    const rateLimit = await checkRateLimit(ip, '/api/general', { maxRequests: 100, windowSeconds: 60 });
    
    if (!rateLimit.allowed) {
      reply.header('Retry-After', '60');
      return reply.status(429).send({ error: 'Too many requests. Please try again later.' });
    }
  }
});

// CSRF protection for state-changing operations
fastify.addHook('preHandler', async (request, reply) => {
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  
  if (stateChangingMethods.includes(request.method)) {
    const csrfToken = request.headers['x-csrf-token'];
    const origin = request.headers.origin;
    const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
    
    // Check Origin header for CSRF protection
    if (origin && origin !== allowedOrigin) {
      return reply.status(403).send({ error: 'Invalid origin' });
    }
    
    // For non-GET endpoints, require proper Content-Type to prevent simple CSRF
    const contentType = request.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return reply.status(400).send({ error: 'Content-Type must be application/json' });
    }
  }
});

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
