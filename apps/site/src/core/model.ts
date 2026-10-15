import { z } from 'zod';
export const roleSchema = z.literal('admin');
export type Role = z.infer<typeof roleSchema>;
export type Actor = { id: string; username: string; role: Role };
export const documentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(1000).default(''),
    path: z
      .string()
      .min(1)
      .max(240)
      .regex(/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/),
    locale: z.enum(['zh', 'en']),
    version: z.literal('latest').default('latest'),
    translationKey: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    group: z.string().max(200).default(''),
    order: z.number().int().min(0).max(100000).default(0),
    mdx: z.string().max(262144),
  })
  .strict();
export type DocumentInput = z.infer<typeof documentSchema>;
export type Revision = DocumentInput & { number: number; actor: string; createdAt: string };
export type Document = {
  id: string;
  revision: number;
  publishedRevision: number | null;
  deleted: boolean;
  draft: Revision;
  published: Revision | null;
};
export const mutationSchema = z
  .object({ expectedRevision: z.number().int().min(0), operationId: z.uuid() })
  .strict();
export const saveSchema = mutationSchema.extend({ document: documentSchema });
export const userSchema = z
  .object({
    username: z.string().regex(/^[a-zA-Z0-9_.-]{3,80}$/),
    password: z.string().min(12).max(256),
    role: roleSchema.default('admin'),
  })
  .strict();

export const userUpdateSchema = z
  .object({ disabled: z.boolean().optional(), password: z.string().min(12).max(256).optional() })
  .strict()
  .refine(
    (value) => value.disabled !== undefined || value.password !== undefined,
    'Provide an account change'
  );
