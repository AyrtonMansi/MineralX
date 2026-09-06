import { z } from 'zod';
export const anchorSchema = z.object({
  type: z.enum(['equipment', 'route', 'point']),
  id: z.string().max(80).nullable(),
  x: z.number().finite(), y: z.number().finite(),
  revision: z.string().max(20),
});
export const createNoteSchema = z.object({
  id: z.string().uuid(), body: z.string().trim().min(1).max(4000),
  priority: z.enum(['normal', 'attention']), anchor: anchorSchema,
}).strict();
export const updateNoteSchema = z.object({
  id: z.string().uuid(), body: z.string().trim().min(1).max(4000),
  priority: z.enum(['normal', 'attention']), status: z.enum(['open', 'resolved']),
  version: z.number().int().positive(),
}).strict();
export type Anchor = z.infer<typeof anchorSchema>;
export type ReviewNote = {
  id: string; body: string; status: 'open' | 'resolved'; priority: 'normal' | 'attention';
  anchor: Anchor; authorName: string; createdAt: string; updatedAt: string;
  version: number; canEdit: boolean;
};
export type NoteDraft = { id: string; body: string; priority: 'normal' | 'attention'; anchor: Anchor; editing?: ReviewNote };
