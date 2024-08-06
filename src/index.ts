import { Hono } from 'hono';
import { customAlphabet } from 'nanoid';
import { KVNamespace } from '@cloudflare/workers-types';

const generateSlug = customAlphabet(
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
	5
);

interface Bindings {
	KV: KVNamespace;
}

const app = new Hono<{ Bindings: Bindings }>();

const authMiddleware = async (c: any, next: () => Promise<void>) => {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || authHeader !== `Bearer ${c.env.APP_SECRET}`) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
};

app.get('/', c => {
	return c.json({ status: 'ok' });
});

app.get('/:slug', async c => {
	const url = await c.env.KV.get(c.req.param('slug'));
	if (url) {
		return c.redirect(url);
	}
	return c.notFound();
});

app.post('/add', authMiddleware, async c => {
	const rawBody = await c.req.text();
	console.log('Raw body:', rawBody);

	let body;
	try {
		body = JSON.parse(rawBody);
	} catch (error) {
		console.error('JSON parse error:', error);
		return c.json({ error: 'Invalid JSON in request body' }, 400);
	}
	let { slug, url } = body;
	console.log('Extracted slug:', slug, 'and url:', url);

	if (!url) {
		console.error('Missing URL');
		return c.json({ error: 'Missing URL' }, 400);
	}

	if (!slug) {
		do {
			slug = generateSlug();
			console.log('Generated slug:', slug);
		} while ((await c.env.KV.get(slug)) !== null);
	}

	try {
		await c.env.KV.put(slug, url);
		console.log(`KV put successful: ${slug}:${url}`);
	} catch (error) {
		console.error('KV put error:', error);
		return c.json({ error: 'Failed to store URL' }, 500);
	}

	const _url = new URL(c.req.url);
	const baseUrl = `${_url.protocol}//${_url.host}`;
	return c.json({ url: `${baseUrl}/${slug}` });
});

export default app;
