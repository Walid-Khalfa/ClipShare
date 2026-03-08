import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { createLogger, generateCorrelationId, formatError, logRequest } from '../lib/logger.js';

const logger = createLogger({ component: 'auth-router' });

const sendMagicLinkSchema = z.object({
  email: z.string().email(),
});

const emailOtpTypeSchema = z.enum([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

export async function authRouter(fastify: FastifyInstance) {
  fastify.post('/magic-link', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
    });
    const startTime = Date.now();
    
    try {
      const body = sendMagicLinkSchema.parse(request.body);
      const { email } = body;

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      
      const { error } = await supabaseAdmin.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${appUrl}/auth/verify`,
        },
      });

      if (error) {
        // Log error securely without exposing sensitive details
        requestLogger.warn({ 
          errorName: error.name,
          errorStatus: error.status,
          emailDomain: email.split('@')[1],
        }, 'Magic link request failed');
      }

      // Always return success to prevent email enumeration attacks
      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return { success: true, message: 'If that email exists, a magic link has been sent' };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Magic link error');
      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return { success: true, message: 'If that email exists, a magic link has been sent' };
    }
  });

  fastify.get('/verify', async (request: FastifyRequest<{ Querystring: { token?: string; type?: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'GET', url: request.url },
    });
    const startTime = Date.now();
    
    const token = request.query.token;
    const parsedType = emailOtpTypeSchema.safeParse(request.query.type ?? 'magiclink');

    if (!token) {
      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 400,
        duration: Date.now() - startTime,
      });
      return reply.status(400).send({ error: 'Missing token' });
    }

    if (!parsedType.success) {
      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 400,
        duration: Date.now() - startTime,
      });
      return reply.status(400).send({ error: 'Invalid verification type' });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        token_hash: token,
        type: parsedType.data,
      });

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'OTP verification failed');
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 400,
          duration: Date.now() - startTime,
          error,
        });
        return reply.status(400).send({ error: error.message });
      }

      const sessionToken = data.session?.access_token;
      const refreshToken = data.session?.refresh_token;
      
      if (!sessionToken) {
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 400,
          duration: Date.now() - startTime,
        });
        return reply.status(400).send({ error: 'No session created' });
      }

      // Access token: 15 minutes (matches Supabase default)
      // Refresh token: 7 days for session persistence
      reply.setCookie('sb-access-token', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 15, // 15 minutes
      });

      // Set refresh token for session persistence (7 days)
      if (refreshToken) {
        reply.setCookie('sb-refresh-token', refreshToken, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }

      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 302,
        duration: Date.now() - startTime,
        userId: data.user?.id,
      });

      return reply.redirect('/dashboard');
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Verify error');
      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    return {
      id: user.id,
      email: user.email,
    };
  });

  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
    });
    const startTime = Date.now();
    
    const sessionToken = request.cookies['sb-access-token'];
    
    if (sessionToken) {
      await supabaseAdmin.auth.signOut();
    }
    
    reply.clearCookie('sb-access-token');
    reply.clearCookie('sb-refresh-token');
    
    logRequest(requestLogger, {
      method: 'POST',
      url: request.url,
      statusCode: 200,
      duration: Date.now() - startTime,
    });
    
    return { success: true };
  });

  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
    });
    const startTime = Date.now();
    
    const refreshToken = request.cookies['sb-refresh-token'];
    
    if (!refreshToken) {
      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 401,
        duration: Date.now() - startTime,
      });
      return reply.status(401).send({ error: 'No refresh token' });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        reply.clearCookie('sb-access-token');
        reply.clearCookie('sb-refresh-token');
        requestLogger.error({ error: formatError(error) }, 'Token refresh failed');
        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 401,
          duration: Date.now() - startTime,
          error,
        });
        return reply.status(401).send({ error: error.message });
      }

      if (data.session) {
        // Access token: 15 minutes (matches Supabase default)
        reply.setCookie('sb-access-token', data.session.access_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 15, // 15 minutes
        });
        
        // Refresh token: 7 days for session persistence
        reply.setCookie('sb-refresh-token', data.session.refresh_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 200,
          duration: Date.now() - startTime,
          userId: data.user?.id,
        });
      }

      return { success: true };
    } catch (error) {
      reply.clearCookie('sb-access-token');
      reply.clearCookie('sb-refresh-token');
      requestLogger.error({ error: formatError(error) }, 'Refresh error');
      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
