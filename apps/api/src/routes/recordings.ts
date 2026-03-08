import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import crypto from 'crypto';
import { sanitizeRecordingTitle, sanitizeRecordingDescription } from '../lib/sanitize.js';
import { createLogger, generateCorrelationId, formatError, logRequest } from '../lib/logger.js';

const logger = createLogger({ component: 'recordings-router' });

const createRecordingSchema = z.object({
  title: z.string().max(200).optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
});

const updateRecordingSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

export async function recordingsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    
    try {
      const body = createRecordingSchema.parse(request.body);

      // Sanitize inputs to prevent XSS
      const sanitizedTitle = body.title ? sanitizeRecordingTitle(body.title) : undefined;

      const { data, error } = await supabaseAdmin
        .from('recordings')
        .insert({
          user_id: userId,
          title: sanitizedTitle || 'Untitled Recording',
          duration: body.duration,
          mime_type: body.mimeType,
          status: 'CREATED',
        })
        .select()
        .single();

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'Create recording error');
        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return reply.status(500).send({ error: 'Failed to create recording' });
      }

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 201,
        duration: Date.now() - startTime,
        userId,
      });

      return data;
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Create recording error');
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

  fastify.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'GET', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '10');
      const skip = (page - 1) * limit;

      const { data: recordings, error: listError, count } = await supabaseAdmin
        .from('recordings')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(skip, skip + limit - 1);

      if (listError) {
        requestLogger.error({ error: formatError(listError) }, 'List recordings error');
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: listError instanceof Error ? listError : new Error(String(listError)),
        });
        return reply.status(500).send({ error: 'Failed to fetch recordings' });
      }

      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return {
        data: recordings || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'List recordings error');
      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'GET', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    const { id } = request.params;

    try {
      const { data, error } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        logRequest(requestLogger, {
          method: 'GET',
          url: request.url,
          statusCode: 404,
          duration: Date.now() - startTime,
          userId,
        });
        return reply.status(404).send({ error: 'Recording not found' });
      }

      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return data;
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Get recording error');
      logRequest(requestLogger, {
        method: 'GET',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'PATCH', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    const { id } = request.params;

    try {
      const body = updateRecordingSchema.parse(request.body);

      const { data: existing } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      // Sanitize inputs to prevent XSS
      const updates: { title?: string; description?: string } = {};
      if (body.title !== undefined) {
        updates.title = sanitizeRecordingTitle(body.title);
      }
      if (body.description !== undefined) {
        updates.description = sanitizeRecordingDescription(body.description);
      }

      const { data, error } = await supabaseAdmin
        .from('recordings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'Update recording error');
        logRequest(requestLogger, {
          method: 'PATCH',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return reply.status(500).send({ error: 'Failed to update recording' });
      }

      logRequest(requestLogger, {
        method: 'PATCH',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return data;
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Update recording error');
      logRequest(requestLogger, {
        method: 'PATCH',
        url: request.url,
        statusCode: 500,
        duration: Date.now() - startTime,
        userId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
      const { data: recording } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (!recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const { error } = await supabaseAdmin
        .from('recordings')
        .delete()
        .eq('id', id);

      if (error) {
        requestLogger.error({ error: formatError(error) }, 'Delete recording error');
        logRequest(requestLogger, {
          method: 'DELETE',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return reply.status(500).send({ error: 'Failed to delete recording' });
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
      requestLogger.error({ error: formatError(error) }, 'Delete recording error');
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
}
