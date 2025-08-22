---
applyTo: "**"
---

# Instruções Copilot

## 1) Stack

* Next.js 15 (App Router + PPR), React 19, TypeScript 5, Tailwind 4, Zod 4
* Node.js 20+, PNPM 10, Better-Auth 1.3
* Para docs de pacotes, use o tool `context7`

## 2) Princípios de Código

* Qualidade de produção (código e docs)
* Prefira o simples ao complexo; explícito ao implícito; estilo funcional e determinístico
* Tipos explícitos em parâmetros e retornos; evite `any` (implícito ou explícito)
* SRP: cada função faz uma coisa bem; evite classes quando funções bastam
* Nomes descritivos e consistentes
* Falhe rápido e de forma clara; não propague dados inválidos
* Comente apenas quando a lógica não for óbvia; docstrings objetivas
* Não assuma requisitos; faça/edite apenas o solicitado

## 3) Fluxo de Trabalho

* Abra a resposta com **o que será feito** e **como**
* Valide com `pnpm run lint` e `pnpm run build`
* Commits em **Conventional Commits**
* Sem pré-otimização, gambiarras ou mocks/dados fictícios sem pedido explícito

## 4) App Router

* Todas as `page.tsx` são **Server Components**.
* **Server Actions** ficam em arquivos separados `*.mutation.ts`.

## 5) Cache & Revalidação (Next.js)

### APIs e onde usar

* `unstable_cache`: servidor. Função assíncrona cacheada (para RSC, Server Actions e Route Handlers).
* `revalidateTag` / `revalidatePath`: apenas em **Server Actions** e **Route Handlers**. Use **juntas** quando quiser consistência de dados na rota específica **e** em outras áreas que compartilham a mesma fonte.
* `connection()`: prefira para tornar a resposta dinâmica e escapar de cache/prerender em Next 15 quando necessário (substitui o uso de `unstable_noStore`). Chame no topo do handler/route para marcar a requisição como dinâmica.

### `unstable_cache(fetcher, keyParts?, { tags?, revalidate? })`

* Use `keyParts` para variáveis externas **não** passadas por parâmetro.
* `tags`: para invalidar com `revalidateTag` (não entram na chave).
* `revalidate`: TTL em segundos; omitido/`false` → cache indefinido até invalidação.
* **Não** acesse `headers()`/`cookies()` **dentro** da função cacheada; passe-os como argumentos.
* A chave do cache considera argumentos e o escopo/closure. Prefira passar dependências como parâmetros e use `keyParts` para valores externos (ex.: tenant/usuário) que não vêm como argumento.

### `fetch` com cache

* Configure `{ next: { revalidate, tags } }` ou `{ cache: 'no-store' | 'force-cache' }` **de forma explícita** conforme a necessidade.
* **Nota importante (Next 15):** as **respostas do `fetch` não são cacheadas por padrão**. **Porém**, a rota pode ser **prerenderizada** e o **output** (HTML/RSC payload) ir para o **Full Route Cache** se for estática. Portanto, não assuma cache automático do `fetch`; opte explicitamente por cache/TTL/tags quando fizer sentido.
* Quando precisar escapar de cache por requisição, prefira `connection()` em vez de `unstable_noStore`.

### Invalidação (obrigatória após mutações)

* `revalidateTag(tag)`: marca dados com a **tag** como stale (atualiza onde a tag é usada).
* `revalidatePath(path, type?)`: invalida página/layout específico; em rotas dinâmicas, informe `type` **apenas** quando usar o **caminho do arquivo** (ex.: `/users/[id]/page`). Se usar o caminho **concreto** (ex.: `/users/123`), **não** passe `type`. Use ambos quando necessário (rota afetada + páginas que compartilham a mesma fonte via tag). **O `path` não pode exceder 1024 caracteres.**

### Diretrizes práticas

* Encapsule leituras de DB/SDK com `unstable_cache` e **tags por domínio** (`users`, `posts`, `settings`).
* Não cacheie dados sensíveis/por usuário sem segmentação adequada; desative conforme necessário.

#### Tags por entidade (além da tag de domínio)

Padronize também uma tag por entidade para invalidação granular:

* domínio: `'users'`
* entidade: ``user:${id}``

Leitura: inclua ambas as tags. Mutação do usuário `id` deve invalidar as duas tags e o path concreto:

```ts
revalidateTag('users')
revalidateTag(`user:${id}`)
revalidatePath(`/users/${id}`) // caminho concreto; sem 'type'
```

---

### 5.1) Formulários e Server Actions (React 19)

Use **`useActionState`** + **`useFormStatus`** para lidar com envio, loading e erros sem libs extras.

```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Form from 'next/form'
import { updateUser } from '@/app/users/users.mutation' // server action

type State = { ok: boolean; message?: string }
const initial: State = { ok: false }

export function ProfileForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState<State, FormData>(updateUser, initial)
  const { pending } = useFormStatus()

  return (
    <Form action={formAction}>
      <input type="hidden" name="id" value={userId} />
      <input name="name" placeholder="Nome" />
      <button disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
      {!state.ok && state.message && <p role="alert">{state.message}</p>}
    </Form>
  )
}
```

**Padrão de retorno:** Actions retornam `{ ok: boolean; message?: string }`.
Referência: Forms + `useActionState`/`useFormStatus`.

Nota: Para padronização adicional, considere o Form Component do Next e o guia “Updating Data” (cobre pending state, revalidação e padrões recomendados). Para listas/tabelas com alta interação, `useOptimistic` oferece UI otimista bem acoplada às Server Actions.

---

### 5.2) Checklist de Server Actions (produção)

1. **Zod** valida input
2. **Autenticação/autorização** (ownership/escopo)
3. **Transação** (`prisma.$transaction`) quando houver múltiplos writes
4. **Idempotência** para operações críticas
5. **Invalidação**: `revalidateTag('domínio')` **e** `revalidatePath('/rota')` quando necessário
6. **Side-effects pós-resposta** com `after()` (logs, métricas, webhooks)
7. **Redirect** se o UX pedir

```ts
// app/users/users.mutation.ts
'use server'
import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { after } from 'next/server'
import prisma from '@/lib/prisma'

const schema = z.object({ id: z.string().uuid(), name: z.string().min(2).max(120) })

export async function updateUser(_: any, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Dados inválidos' }

  const { id, name } = parsed.data

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { name } })
  })

  revalidateTag('users')
  revalidatePath(`/users/${id}`, 'page')

  after(() => {
    // logging/métricas/filas
  })

  return { ok: true }
}
```

Referência para `after()`.

---

### 5.3) Leituras cacheadas e granularidade

**Abordagem estável (recomendada):**

* Use `unstable_cache` com **tag de domínio** (ex.: `'users'`).
* Após mutation, **invalide a tag** e **o path concreto** da página afetada.

```ts
// app/users/data.ts
import { unstable_cache } from 'next/cache'
import prisma from '@/lib/prisma'

export const getUser = unstable_cache(
  async (id: string) => prisma.user.findUnique({ where: { id } }),
  ['getUser'],
  { tags: ['users'] }
)
```

Para granularidade por entidade, inclua a tag específica da entidade ao ler e invalide ambas ao escrever. Um padrão seguro é criar a função cacheada por-entidade (factory), permitindo compor as tags com o `id`:

```ts
// leitura com tags por entidade
export function getUserById(id: string) {
  return unstable_cache(
    async () => prisma.user.findUnique({ where: { id } }),
    ['getUserById', id],
    { tags: ['users', `user:${id}`] }
  )()
}

// após mutation
revalidateTag('users')
revalidateTag(`user:${id}`)
revalidatePath(`/users/${id}`)
```

---

### 5.4) Segurança de Server Actions

* **CSRF / proxies confiáveis:** configure `serverActions.allowedOrigins` no `next.config.*`.
* **Payloads:** limite com `serverActions.bodySizeLimit` (padrão \~1 MB).
* Prefira **Route Handlers** para uploads grandes/streaming.
* Não retorne mensagens sensíveis ao cliente; faça log seguro no servidor.

```ts
// next.config.ts
import type { NextConfig } from 'next'
const config: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['https://app.exemplo.com', '*.proxy.exemplo.com'],
      bodySizeLimit: '2mb',
    },
  },
}
export default config
```

---

### 5.5) Observabilidade & Operações

* Use `instrumentation.ts` + OpenTelemetry/Sentry; acople **`after()`** para tarefas pós-resposta (não bloquear a UI).
* **Rate limiting** em Actions sensíveis (login, signup).
* (Opcional) Ajuste **stale times** do Router Cache se estiver usando navegação client-side intensiva.
* Erros e 404 idiomáticos: use `error.tsx`/`not-found.tsx` e, em blocos `try/catch`, utilize `unstable_rethrow` para não engolir erros especiais do Next (ex.: `notFound()`/`redirect()`).

Exemplo:

```ts
import { unstable_rethrow } from 'next/navigation'

try {
  // ...
} catch (e) {
  unstable_rethrow(e) // preserva notFound/redirect
  throw e // demais erros
}
```

---

### 5.6) Comportamento padrão do `fetch` (e Full Route Cache)

> **Resumo sem ambiguidade:** No Next 15, **respostas do `fetch` não são cacheadas por padrão**. Entretanto, **se sua rota for estática**, o **resultado renderizado da rota** ainda pode ser **prerenderizado** e servido do **Full Route Cache**. Se você precisa de cache de dados, **opte explicitamente** (`{ cache: 'force-cache' }` ou `{ next: { revalidate } }`). Se precisa de dados sempre frescos, use `{ cache: 'no-store' }`.

---

## 6) Cookies, Autenticação e Sessões (Next 15 + Better Auth)

**Cookies (`next/headers`)**

* `cookies()` é assíncrono; leia em **Server Components**
* `set|delete|clear` apenas em **Server Actions/Route Handlers** (antes do streaming)

**Better Auth (mínimo)**

* **Server:** `export const auth = betterAuth({ database, secret, plugins? })`
* **Client (React):** `export const authClient = createAuthClient({ plugins? })` com `signUp.email`, `signIn.email|social|username`, `signOut`, `useSession/getSession`
* **Sessão no servidor:** `await auth.api.getSession({ headers: await headers() })` (RSC e Routes)
* **Server Actions/Routes:** prefira `nextCookies()` para propagar `Set-Cookie` automaticamente

**Integração Next.js (essencial)**

```ts
// src/app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth.handler)
```

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient({})
```

```ts
// Server Action
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
export async function someAction() {
  'use server'
  const session = await auth.api.getSession({ headers: await headers() })
}
```

```ts
// next-js cookies plugin
import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
export const auth = betterAuth({
  // ...
  plugins: [nextCookies()], // deixe por último
})
```

**Middleware (checagem otimista via cookie; não é segurança definitiva)**

```ts
import { NextResponse, NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) return NextResponse.redirect(new URL('/login', request.url))
  return NextResponse.next()
}
export const config = { matcher: ['/control', '/:account/:assistant'] }
```

(Alternativa experimental validando no servidor com runtime Node.js disponível.)

**Sessões**

* Persistência: tabela `session`. Cookies httpOnly assinados: `session_token` (principal), `session_data` (cache opcional), `dont_remember` (quando “lembrar-me” off). Evite PII em cookies.
* “Remember me”: defina `rememberMe` no `signIn.*`.
* Autorização: crie `verifySession()` (DAL) que usa `auth.api.getSession(...)`.
* Middleware: apenas checagens otimistas baseadas no cookie.

**Boas práticas**

* Valide com **Zod** no servidor; **redirecione** após sucesso.
* Não setar cookies manualmente quando o Better Auth já faz isso.

## 7) Prisma + Next.js 15

**Schema (`prisma/schema.prisma`)**

* `generator client { provider = "prisma-client-js" }`
* Postgres: `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`
* Vercel Postgres (serverless com pool):

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_PRISMA_URL")      // pooled
  directUrl = env("POSTGRES_URL_NON_POOLING") // migrações
}
```

**Comandos**

* Após alterar o schema: `pnpm prisma generate`
* Dev: `pnpm prisma migrate dev -n "init"`
* Prod/CI: `pnpm prisma migrate deploy`
* Prototipagem: `pnpm prisma db push` (evite em produção)
* Studio: `pnpm prisma studio`

**Cliente Prisma (singleton) — `src/lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
export default prisma
```

**Uso no App Router**

* **Server Components:** importe e use `prisma.*` direto
* **Leituras:** envolva em `unstable_cache` com **tags de domínio** (não use `headers/cookies` dentro do escopo cacheado)
* **Mutações (em `*.mutation.ts`/Routes):** execute `prisma.*` e **invalide**:

```ts
// exemplo de invalidação após mutation
// revalidateTag('users')
// revalidatePath('/users/[id]', 'page')
```

**Runtime & Conexões**

* Prisma requer **Node.js** (não use **edge**).
* Em serverless, prefira **pooling** (ex.: `POSTGRES_PRISMA_URL`).

Para evitar regressões por refactors em páginas/handlers que tocam Prisma, declare o runtime explicitamente:

```ts
// em páginas/handlers que tocam Prisma
export const runtime = 'nodejs'
```

## 8) Partial Prerendering (PPR) — Next.js 15

* **Experimental**; avalie antes de produção.
* Habilite em `next.config.*`: `experimental: { ppr: 'incremental' }`.
* Opt-in por segmento: `export const experimental_ppr = true` no topo da rota; delimite partes dinâmicas com `Suspense`.
* PPR **não substitui** cache/revalidação.

```ts
// next.config.ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  experimental: {
    ppr: 'incremental',
  },
}
export default nextConfig
```

```tsx
// app/page.tsx
import { Suspense } from 'react'
export const experimental_ppr = true

export default function Page() {
  return (
    <>
      {/* shell estático */}
      <Header />
      {/* lacuna dinâmica streamada */}
      <Suspense fallback={<Skeleton />}>
        <Feed />
      </Suspense>
    </>
  )
}
```
