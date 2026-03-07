import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { getPresignedUploadUrl, uploadFile, deleteFile } from '../lib/storage.js';

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
    const userId = request.user.id;
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
      return reply.status(500).send({ error: 'Failed to create upload URL' });
    }

    await supabaseAdmin
      .from('recordings')
      .update({
        status: 'UPLOADING',
        raw_path: path,
      })
      .eq('id', recordingId);

    return {
      uploadUrl: uploadData.signedUrl,
      path,
    };
  });

  fastify.post('/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
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

    return { success: true, status: 'UPLOADED' };
  });

  fastify.post('/abort', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
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

    return { success: true };
  });
}
