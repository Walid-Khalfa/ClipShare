import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { getPresignedUploadUrl, uploadFile, deleteFile } from '../lib/storage.js';
import { createLogger, generateCorrelationId, formatError, logRequest } from '../lib/logger.js';

const logger = createLogger({ component: 'upload-router' });

const initiateSchema = z.object({
  recordingId: z.string(),
  contentType: z.string(),
  fileSize: z.number(),
});

const completeSchema = z.object({
  recordingId: z.string(),
  path: z.string(),
});

export async function uploadRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/initiate', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    
    try {
      const body = initiateSchema.parse(request.body);
      const { recordingId } = body;

      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const path = `uploads/${userId}/${recordingId}/raw`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('recordings')
        .createSignedUploadUrl(path);

      if (uploadError) {
        requestLogger.error({ error: formatError(uploadError) }, 'Failed to create upload URL');
        logRequest(requestLogger, {
          method: 'POST',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId,
          error: uploadError instanceof Error ? uploadError : new Error(String(uploadError)),
        });
        return reply.status(500).send({ error: 'Failed to create upload URL' });
      }

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'UPLOADING',
          raw_path: path,
        })
        .eq('id', recordingId);

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return {
        uploadUrl: uploadData.signedUrl,
        path,
      };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Initiate upload error');
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

  fastify.post('/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    
    try {
      const body = completeSchema.parse(request.body);
      const { recordingId, path } = body;

      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'UPLOADED',
        })
        .eq('id', recordingId);

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return { success: true, status: 'UPLOADED' };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Complete upload error');
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

  fastify.post('/abort', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();
    const requestLogger = logger.child({ 
      correlationId,
      http: { method: 'POST', url: request.url },
      userId: request.user.id,
    });
    const startTime = Date.now();
    
    const userId = request.user.id;
    
    try {
      const { recordingId } = z.object({
        recordingId: z.string(),
      }).parse(request.body);

      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !recording) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (recording.raw_path) {
        await deleteFile(recording.raw_path);
      }

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'CREATED',
          raw_path: null,
        })
        .eq('id', recordingId);

      logRequest(requestLogger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId,
      });

      return { success: true };
    } catch (error) {
      requestLogger.error({ error: formatError(error) }, 'Abort upload error');
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
}
