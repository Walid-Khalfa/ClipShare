import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { getPresignedDownloadUrl, getPublicUrl } from '../lib/storage.js';
import crypto from 'crypto';

export async function shareRouter(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/recordings/:id/share', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;

    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !recording) {
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
      return reply.status(500).send({ error: 'Failed to share recording' });
    }

    return {
      shareToken,
      shareUrl: `${process.env.APP_URL || 'http://localhost:3000'}/share/${shareToken}`,
    };
  });

  fastify.delete<{ Params: { id: string } }>('/recordings/:id/share', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;

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
      return reply.status(500).send({ error: 'Failed to revoke sharing' });
    }

    return { success: true };
  });

  fastify.get('/:token', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const { token } = request.params;

    const { data: recording, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('share_token', token)
      .eq('is_public', true)
      .single();

    if (error || !recording) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    if (recording.status !== 'READY' || !recording.processed_path) {
      return reply.status(400).send({ error: 'Recording not ready' });
    }

    const videoUrl = await getPublicUrl(recording.processed_path);
    const thumbnailUrl = recording.thumbnail_path 
      ? getPublicUrl(recording.thumbnail_path)
      : null;

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
  });

  fastify.post('/:token/view', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const { token } = request.params;
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

    return { success: true };
  });
}
