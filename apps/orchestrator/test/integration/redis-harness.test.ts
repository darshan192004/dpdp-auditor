import { once } from 'node:events';
import net from 'node:net';
import { describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_TEST_URL || null;

(redisUrl ? describe : describe.skip)('redis harness', () => {
  it('answers PING', async () => {
    const { hostname, port } = new URL(redisUrl!);
    const socket = net.connect({ host: hostname, port: Number(port) });
    await once(socket, 'connect');
    socket.write('PING\r\n');
    const chunks = (await once(socket, 'data')) as Buffer[];
    socket.destroy();
    expect(chunks[0]?.toString()).toBe('+PONG\r\n');
  });
});
