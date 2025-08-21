import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog collection using Content Layer API (Astro v5)
const blog = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/data/blog' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        draft: z.boolean().default(false),
        tags: z.array(z.string()).default([])
    })
});

export const collections = { blog };
