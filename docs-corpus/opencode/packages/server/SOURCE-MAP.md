# Package: @opencode-ai/server

**Source:** `/tmp/opencode-unified/packages/server/`

## package.json
```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@opencode-ai/server",
  "version": "1.17.7",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    "./*": "./src/*.ts"
  },
  "scripts": {
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@opencode-ai/core": "workspace:*",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## Directory Structure
```
.
./package.json
./src
./src/api.ts
./src/auth.ts
./src/cors.ts
./src/errors.ts
./src/groups
./src/handlers
./src/handlers.ts
./src/middleware
./src/pty-environment.ts
./src/routes.ts
./sst-env.d.ts
./tsconfig.json
```

## src/ Contents
```
./api.ts
./auth.ts
./cors.ts
./errors.ts
./groups/agent.ts
./groups/command.ts
./groups/credential.ts
./groups/event.ts
./groups/fs.ts
./groups/health.ts
./groups/integration.ts
./groups/location.ts
./groups/message.ts
./groups/model.ts
./groups/permission.ts
./groups/project-copy.ts
./groups/provider.ts
./groups/pty.ts
./groups/question.ts
./groups/reference.ts
./groups/session.ts
./groups/skill.ts
./handlers.ts
./handlers/agent.ts
./handlers/command.ts
./handlers/credential.ts
./handlers/event.ts
./handlers/fs.ts
./handlers/health.ts
./handlers/integration.ts
./handlers/location.ts
./handlers/message.ts
./handlers/model.ts
./handlers/permission.ts
./handlers/project-copy.ts
./handlers/provider.ts
./handlers/pty.ts
./handlers/question.ts
./handlers/reference.ts
./handlers/session.ts
./handlers/skill.ts
./middleware/authorization.ts
./middleware/schema-error.ts
./middleware/session-location.ts
./pty-environment.ts
./routes.ts
```
