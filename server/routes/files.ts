import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { attachments } from '../db/schema';
import { requireAuth, type AppEnv } from '../lib/auth';
import { generateId } from '../lib/ids';

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');

export const filesApp = new Hono<AppEnv>();
filesApp.use('*', requireAuth);

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.sh', '.ps1', '.jar'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function classifyFileType(mimeType: string, fileName: string): 'image' | 'document' | 'file' | 'audio' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  const ext = path.extname(fileName).toLowerCase();
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md'].includes(ext)) {
    return 'document';
  }
  return 'file';
}

filesApp.post('/upload', async (c) => {
  const userId = c.get('user').id;

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart form data.' }, 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return c.json({ error: 'No file provided.' }, 400);
  }

  if (file.size === 0) {
    return c.json({ error: 'File is empty.' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File exceeds the 25MB size limit.' }, 413);
  }

  const originalName = path.basename(file.name || 'attachment');
  const ext = path.extname(originalName).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return c.json({ error: 'This file type is not allowed for security reasons.' }, 400);
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const uniqueName = `${Date.now()}_${generateId()}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, uniqueName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);

  const fileType = classifyFileType(file.type || 'application/octet-stream', originalName);

  // Basic image dimensions sniffing (PNG/JPEG) for lightbox hints
  let width: number | null = null;
  let height: number | null = null;
  if (fileType === 'image') {
    try {
      if (ext === '.png' && buffer.length > 24) {
        width = buffer.readUInt32BE(16);
        height = buffer.readUInt32BE(20);
      } else if ((ext === '.jpg' || ext === '.jpeg') && buffer.length > 4 && buffer[0] === 0xff) {
        let offset = 2;
        while (offset < buffer.length - 9) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          const segLength = buffer.readUInt16BE(offset + 2);
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            height = buffer.readUInt16BE(offset + 5);
            width = buffer.readUInt16BE(offset + 7);
            break;
          }
          offset += 2 + segLength;
        }
      }
    } catch {
      // dimension sniffing is best-effort
    }
  }

  const attId = generateId('att');
  const now = new Date().toISOString();
  const url = `/uploads/${uniqueName}`;

  await getDb().insert(attachments).values({
    id: attId,
    messageId: null,
    uploaderId: userId,
    fileName: originalName,
    fileType,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    url,
    width,
    height,
    createdAt: now,
  });

  const attachmentRow = await getDb().select().from(attachments).where(eq(attachments.id, attId)).limit(1);

  return c.json(
    {
      attachment: {
        id: attachmentRow[0].id,
        messageId: null,
        fileName: attachmentRow[0].fileName,
        fileType: attachmentRow[0].fileType,
        mimeType: attachmentRow[0].mimeType,
        fileSize: attachmentRow[0].fileSize,
        url: attachmentRow[0].url,
        width: attachmentRow[0].width,
        height: attachmentRow[0].height,
        createdAt: attachmentRow[0].createdAt,
      },
    },
    201,
  );
});

// GET /api/files/:id — attachment metadata
filesApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await getDb().select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!rows[0]) return c.json({ error: 'Attachment not found.' }, 404);
  return c.json({ attachment: rows[0] });
});
