export const sharedUris: string[] = [];

export let shareAvailable = true;

export function __setShareAvailable(value: boolean): void {
  shareAvailable = value;
}

export async function isAvailableAsync(): Promise<boolean> {
  return shareAvailable;
}

export async function shareAsync(uri: string): Promise<void> {
  sharedUris.push(uri);
}
