---
applyTo: "*"
---

# Astro 5.13+ Copilot Instructions

- Sempre garanta qualidade de código e documentação em nível industrial e de produção.
- Não utilize `Any` seja implícito ou explícito.
- Prefira o explícito ao implícito e o simples ao complexo.
- Prefira estilos de programação funcional e determinístico.
- Sempre utilize tipos nas assinaturas de parâmetros e retornos das funções.
- Uma função deve fazer apenas uma coisa e fazê-la bem.
- Não utilize uma classe se uma função for suficiente.
- Sempre use nomes descritivos e significativos para variáveis, funções e classes.
- O código jamais deve falhar silenciosamente; falhe imediatamente e de forma explícita.
- Não propague dados inválidos esperando que outra parte do código trate o erro.
- Comentários só devem ser usados quando a lógica não for trivial.
- As docstrings devem ser objetivas, sem prolixidade ou redundância.
- Nunca assuma informações não explicitadas.
- Faça, mostre e edite apenas o que for solicitado.
- Sempre inicie sua resposta explicando ao usuário o que será feito e como será feito.
- Use mensagens de commit seguindo o padrão `conventional commits`.
- Utilize a tool `context7` para buscar documentação de pacotes e bibliotecas.
- Não pré-otimize.
- Não utilize gambiarras ou soluções temporárias para contornar problemas.
- Não implemente mockups ou dados fictícios sem solicitação explícita.
- O ano atual é 2025.


## 1) Stack Essencial

**Astro 5.13+** (Node 20+, Vite 5, TypeScript nativo)
- **Gerenciador**: pnpm
- **Filosofia**: Server-first, zero JS default, hidratação seletiva
- **Content Layer**: API unificada para conteúdo local/remoto
- **DB**: SQLite integrado com sync remoto

```sh
pnpm create astro@latest
pnpm dev / build / preview
pnpm astro sync / check
```

## 2) Estrutura Core

```
src/
├── components/         # .astro/.jsx/.vue/.svelte
├── layouts/           # Templates base
├── pages/             # File-based routing + API routes
├── content/           # Collections com loaders
│   ├── config.ts      # Schema + loaders
│   └── blog/          # Markdown/dados
├── assets/            # Imagens otimizadas
└── db/                # Astro DB schema/seed
```

## 3) Componentes Astro

```astro
---
// Props tipadas
interface Props {
  title: string;
  count?: number;
}

const { title, count = 0 } = Astro.props;

// Fetch direto (cache automático em build)
const posts = await fetch('/api/posts').then(r => r.json());
---

<article class="card">
  <h1>{title}</h1>
  <p>Posts: {posts.length}</p>

  <!-- Slots -->
  <slot />
  <footer><slot name="actions" /></footer>
</article>

<style>
  .card { padding: 1rem; }
  :global(body) { margin: 0; }
</style>

<script>
  // Client-side apenas quando necessário
  console.log('Hidratado');
</script>
```

## 4) Content Layer API (v5+)

```ts
// content/config.ts
import { defineCollection, z, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';

const blog = defineCollection({
  // Loader local
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/data/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).default([]),
    author: reference('authors'),
    draft: z.boolean().default(false)
  })
});

const authors = defineCollection({
  loader: file("src/data/authors.json"),
  schema: z.object({
    name: z.string(),
    bio: z.string(),
    avatar: z.string().url()
  })
});

// Loader remoto
const products = defineCollection({
  loader: async () => {
    const res = await fetch('https://api.shop.com/products');
    const products = await res.json();
    return products.map(p => ({ id: p.id, ...p }));
  },
  schema: z.object({
    name: z.string(),
    price: z.number(),
    category: z.string()
  })
});

export const collections = { blog, authors, products };
```

```astro
---
import { getCollection, getEntry, render } from 'astro:content';

// Collection completa
const posts = await getCollection('blog', ({ data }) => !data.draft);

// Entrada específica
const post = await getEntry('blog', Astro.params.slug);
const { Content, headings } = await render(post);

// Resolver referências
const author = await getEntry(post.data.author);
---

<article>
  <h1>{post.data.title}</h1>
  <p>Por: {author.data.name}</p>
  <Content />
</article>
```

## 5) Astro DB

```ts
// db/config.ts
import { defineDb, defineTable, column } from 'astro:db';

const Comment = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    author: column.text(),
    content: column.text(),
    postId: column.text(),
    createdAt: column.date({ default: new Date() })
  }
});

export default defineDb({ tables: { Comment } });
```

```ts
// db/seed.ts
import { db, Comment } from 'astro:db';

export default async function() {
  await db.insert(Comment).values([
    { author: 'João', content: 'Ótimo post!', postId: 'primeiro-post' }
  ]);
}
```

```astro
---
import { db, Comment, eq } from 'astro:db';

// Queries
const comments = await db.select().from(Comment);
const postComments = await db
  .select()
  .from(Comment)
  .where(eq(Comment.postId, Astro.params.slug));
---
```

## 6) Imagens Otimizadas

```astro
---
import { Image, Picture } from 'astro:assets';
import hero from '../assets/hero.jpg';
---

<!-- Básico -->
<Image
  src={hero}
  alt="Hero"
  width={800}
  height={400}
  format="webp"
  loading="lazy"
/>

<!-- Responsivo -->
<Picture
  src={hero}
  alt="Hero"
  widths={[400, 800, 1200]}
  sizes="(max-width: 768px) 100vw, 800px"
  formats={['avif', 'webp']}
/>

<!-- Remota -->
<Image
  src="https://images.unsplash.com/photo-123"
  alt="Unsplash"
  width={600}
  height={300}
  inferSize
/>
```

```js
// astro.config.mjs
export default defineConfig({
  image: {
    domains: ['images.unsplash.com'],
    remotePatterns: [{ protocol: 'https', hostname: '**.cdn.com' }]
  }
});
```

## 7) API Routes

```ts
// pages/api/comments.ts
import type { APIRoute } from 'astro';
import { db, Comment, eq } from 'astro:db';

export const GET: APIRoute = async ({ url }) => {
  const postId = url.searchParams.get('post');

  const comments = await db
    .select()
    .from(Comment)
    .where(eq(Comment.postId, postId));

  return Response.json(comments);
};

export const POST: APIRoute = async ({ request }) => {
  const { author, content, postId } = await request.json();

  const newComment = await db.insert(Comment).values({
    author, content, postId
  }).returning();

  return Response.json(newComment[0], { status: 201 });
};
```

## 8) Actions (Form Handling)

```ts
// src/actions/index.ts
import { defineAction, z } from 'astro:actions';
import { db, Comment } from 'astro:db';

export const server = {
  addComment: defineAction({
    input: z.object({
      author: z.string().min(2),
      content: z.string().min(10),
      postId: z.string()
    }),
    handler: async ({ author, content, postId }) => {
      const comment = await db.insert(Comment).values({
        author, content, postId
      }).returning();

      return { success: true, comment: comment[0] };
    }
  })
};
```

```astro
---
import { actions } from 'astro:actions';
---

<!-- Form declarativo -->
<form method="POST" action={actions.addComment}>
  <input type="hidden" name="postId" value={Astro.params.slug} />
  <input name="author" required />
  <textarea name="content" required></textarea>
  <button>Comentar</button>
</form>

<script>
  import { actions } from 'astro:actions';

  // Uso programático
  const result = await actions.addComment({
    author: 'João',
    content: 'Excelente!',
    postId: 'meu-post'
  });
</script>
```

## 9) Islands Architecture

```astro
---
import Counter from '../components/Counter.jsx';
import Modal from '../components/Modal.vue';
---

<!-- Estratégias de hidratação -->
<Counter client:load />         <!-- Imediato -->
<Modal client:idle />          <!-- Quando ocioso -->
<Counter client:visible />     <!-- Quando visível -->
<Modal client:media="(max-width: 768px)" />

<!-- Server Islands -->
<DatabaseComponent server:defer>
  <p slot="fallback">Carregando...</p>
</DatabaseComponent>
```

## 10) View Transitions

```astro
---
// Layout.astro
import { ViewTransitions } from 'astro:transitions';
---

<html>
  <head>
    <ViewTransitions />
  </head>
  <body>
    <!-- Elementos persistentes -->
    <nav transition:persist="nav">
      <a href="/">Home</a>
      <a href="/blog">Blog</a>
    </nav>

    <main transition:animate="slide">
      <slot />
    </main>
  </body>
</html>
```

```astro
<script>
  import { navigate } from 'astro:transitions/client';

  // Navegação programática
  document.querySelector('#link').onclick = () => {
    navigate('/nova-pagina');
  };
</script>
```

## 11) Configuração Essencial

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://meusite.com',
  output: 'server', // 'static' | 'hybrid'

  integrations: [
    db(),
    react()
  ],

  // Variáveis ambiente tipadas
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server' }),
      PUBLIC_API_URL: envField.string({ context: 'client' })
    }
  },

  markdown: {
    shikiConfig: { theme: 'github-dark' }
  }
});
```

## 12) Comandos Principais

```sh
# Desenvolvimento
pnpm dev --host
pnpm astro sync
pnpm astro check

# Build
pnpm build
pnpm preview

# DB
pnpm astro db push --remote
pnpm astro db seed

# Templates
pnpm create astro@latest -- --template blog
```

## 13) Padrões de Performance

```astro
---
// ✅ Fetch condicional
const data = Astro.url.searchParams.has('details')
  ? await fetch('/api/heavy-data').then(r => r.json())
  : null;

// ✅ Error handling
let post;
try {
  post = await getEntry('blog', Astro.params.slug);
  if (!post) return Astro.redirect('/404');
} catch (error) {
  console.error('Post não encontrado:', error);
}
---

<!-- ✅ Lazy loading -->
<Image src={hero} loading="lazy" />

<!-- ✅ Preload crítico -->
<link rel="preload" href="/font.woff2" as="font" crossorigin />
```

## 14) Deploy

```sh
# Adapters principais
npx astro add vercel
npx astro add netlify
npx astro add node
npx astro add cloudflare

# Build otimizado
pnpm build --analyze
```

```js
// Deploy config
export default defineConfig({
  adapter: vercel({
    webAnalytics: true,
    speedInsights: true
  }),
  build: {
    inlineStylesheets: 'auto'
  }
});
```

---

**Lembre-se**: Astro é server-first. Use hidratação client apenas quando necessário. O Content Layer API unifica markdown local e dados remotos. Astro DB oferece SQLite zero-
