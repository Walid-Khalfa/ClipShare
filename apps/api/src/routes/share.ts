import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { getPresignedDownloadUrl, getPublicUrl } from '../lib/storage.js';
import { createLogger, generateCorrelationId, formatError, logRequest } from '../lib/logger.js';
import crypto from 'crypto';

const logger = createLogger({ component: 'share-router' });

export async function shareRouter(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/recordings/:id/share', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    const { id } = request.params;

    try {
      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError || !recording) {
        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 404,
          duration: Date.now() - startTime,
          userId,
        });
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const shareToken = recording.share_token || crypto.randomUUID().slice(0, 12);

      const { data, error } = await supabaseAdmin
        .from('recordings')
        .update({
          is_public: true,
          share_token: shareToken,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'Failed to share recording');
        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return reply.status(500).send({ error: 'Failed to share recording' });
      }

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return {
        shareToken,
        shareUrl: `${process.env.APP_URL || 'http://localhost:3000'}/share/${shareToken}`,
      };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Share recording error');
      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/recordings/:id/share', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'DELETE', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    const { id } = request.params;

    try {
      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError || !recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const { error } = await supabaseAdmin
        .from('recordings')
        .update({
          is_public: false,
          share_token: null,
        })
        .eq('id', id);

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'Failed to revoke sharing');
        logRequest(requestLogger, {
          method: 'DELETE',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return reply.status(500).send({ error: 'Failed to revoke sharing' });
      }

      logRequest(requestLogger, {
        method: 'DELETE',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return { success: true };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Revoke sharing error');
      logRequest(requestLogger, {
        method: 'DELETE',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/:token', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'GET', url: request.url },
    });
    const startTime = Date.now();
    
    const { token } = request.params;

    try {
      const { data: recording, error } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('share_token', token)
        .eq('is_public', true)
        .single();

      if (error || !recording) {
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 404,
          duration: Date.now() - startTime,
        });
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (recording.status !== 'READY' || !recording.processed_path) {
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 400,
          duration: Date.now() - startTime,
        });
        return reply.status(400).send({ error: 'Recording not ready' });
      }

      const videoUrl = await getPublicUrl(recording.processed_path);
      const thumbnailUrl = recording.thumbnail_path 
        ? getPublicUrl(recording.thumbnail_path)
        : null;

      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return {
        id: recording.id,
        title: recording.title,
        description: recording.description,
        duration: recording.duration,
        videoUrl,
        thumbnailUrl,
        view_count: recording.view_count,
        created_at: recording.created_at,
      };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Get shared recording error');
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

  fastify.post('/:token/view', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
    });
    const startTime = Date.now();
    
    const { token } = request.params;

    try {
      const { ipHash, userAgent, referrer } = z.object({
        ipHash: z.string().optional(),
        userAgent: z.string().optional(),
        referrer: z.string().optional(),
      }).parse(request.body);

      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('share_token', token)
        .eq('is_public', true)
        .single();

      if (fetchError || !recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      await supabaseAdmin
        .from('view_events')
        .insert({
          recording_id: recording.id,
          ip_hash: ipHash,
          user_agent: userAgent,
          referrer,
        });

      await supabaseAdmin
        .from('recordings')
        .update({ view_count: recording.view_count + 1 })
        .eq('id', recording.id);

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return { success: true };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'View tracking error');
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
