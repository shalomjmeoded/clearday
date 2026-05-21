import { Platform } from 'react-native';

const SESSION_ID = 'a54249';
const INGEST_PATH = '/ingest/aa975640-8a0e-408c-80e9-8a89e15aaded';
const INGEST_HOSTS =
  Platform.OS === 'android' ? ['http://10.0.2.2:7653', 'http://127.0.0.1:7653'] : ['http://127.0.0.1:7653'];

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'initial'
) {
  const payload = {
    sessionId: SESSION_ID,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  if (__DEV__) {
    console.log(`[DEBUG-${SESSION_ID}] ${JSON.stringify(payload)}`);
  }

  for (const host of INGEST_HOSTS) {
    fetch(`${host}${INGEST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION_ID,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}
