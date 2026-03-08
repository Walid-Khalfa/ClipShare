import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';

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
      console.error('Magic link request failed:', { 
        error: error.name,
        status: error.status 
      });
    }

    // Always return success to prevent email enumeration attacks
    return { success: true, message: 'If that email exists, a magic link has been sent' };
  });

  fastify.get('/verify', async (request: FastifyRequest<{ Querystring: { token?: string; type?: string } }>, reply: FastifyReply) => {
    const token = request.query.token;
    const parsedType = emailOtpTypeSchema.safeParse(request.query.type ?? 'magiclink');

    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }

    if (!parsedType.success) {
      return reply.status(400).send({ error: 'Invalid verification type' });
    }

    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: parsedType.data,
    });

    if (error) {
      return reply.status(400).send({ error: error.message });
    }

    const sessionToken = data.session?.access_token;
    const refreshToken = data.session?.refresh_token;
    
    if (!sessionToken) {
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

    return reply.redirect('/dashboard');
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    return {
      id: user.id,
      email: user.email,
    };
  });

  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = request.cookies['sb-access-token'];
    
    if (sessionToken) {
      await supabaseAdmin.auth.signOut();
    }
    
    reply.clearCookie('sb-access-token');
    reply.clearCookie('sb-refresh-token');
    return { success: true };
  });

  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies['sb-refresh-token'];
    
    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      reply.clearCookie('sb-access-token');
      reply.clearCookie('sb-refresh-token');
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
    }

    return { success: true };
  });
}
