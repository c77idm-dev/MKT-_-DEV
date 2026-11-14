import { servidorTus } from '@/modules/midia/tus';

export const dynamic = 'force-dynamic';

/** Upload que retoma (tus, spec §9). HEAD informa até onde chegou; PATCH manda os pedaços de 5 MB. */
async function tratar(req: Request): Promise<Response> {
  return servidorTus().handleWeb(req);
}

export const GET = tratar;
export const HEAD = tratar;
export const POST = tratar;
export const PATCH = tratar;
export const DELETE = tratar;
export const OPTIONS = tratar;
