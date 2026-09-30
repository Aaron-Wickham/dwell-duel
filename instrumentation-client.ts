// Client errors go to Sentry only when a DSN is set; see lib/observability/client.ts.
import { loadClientSentry } from '@/lib/observability/client'

void loadClientSentry()?.catch(() => {})
