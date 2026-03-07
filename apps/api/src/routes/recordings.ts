import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import crypto from 'crypto';

const createRecordingSchema = z.object({
  title: z.string().optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
});

const updateRecordingSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

export async function recordingsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = createRecordingSchema.parse(request.body);

    const { data, error } = await supabaseAdmin
      .from('recordings')
      .insert({
        user_id: userId,
        title: body.title || 'Untitled Recording',
        duration: body.duration,
        mime_type: body.mimeType,
        status: 'CREATED',
      })
      .select()
      .single();

    if (error) {
      console.error('Create recording error:', error);
      return reply.status(500).send({ error: 'Failed to create recording' });
    }

    return data;
  });

  fastify.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
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
      console.error('List recordings error:', listError);
      return reply.status(500).send({ error: 'Failed to fetch recordings' });
    }

    return {
      data: recordings || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    };
  });

  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { id } = request.params;

    const { data, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    return data;
  });

  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { id } = request.params;
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

    const { data, error } = await supabaseAdmin
      .from('recordings')
      .update({
        title: body.title,
        description: body.description,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return reply.status(500).send({ error: 'Failed to update recording' });
    }

    return data;
  });

  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { id } = request.params;

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
      return reply.status(500).send({ error: 'Failed to delete recording' });
    }

    return { success: true };
  });
}
