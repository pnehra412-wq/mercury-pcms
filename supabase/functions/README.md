# Mercury Supabase Edge Functions

This folder versions the Edge Function source currently deployed to the existing Mercury Supabase project. Function configuration is recorded in ../config.toml.

## Authentication model
- mercury-app, mercury-capture and mercury-office serve static login/application pages. Their data APIs independently require an authenticated owner session.
- capture-mobile-order, capture-shared-court-order and publish-mercury-web require a valid JWT at the Supabase gateway. The order-capture handler also verifies the workspace owner and scopes database operations to that user.
- All server-only credentials are read from Supabase environment variables. Do not commit service-role keys, Notion tokens, VAPID keys or other secrets.

## Deployment
Deploy from the repository root with the Supabase CLI and the existing project reference. Review the migration history and confirm the target project before applying database migrations. Do not deploy functions with a service-role secret embedded in source.
