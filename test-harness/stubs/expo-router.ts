/** expo-router stub: records navigation so tests can assert on it. */
export const pushed: string[] = [];

export const router = {
  push(path: string): void {
    pushed.push(path);
  },
  back(): void {},
};

export function __resetRouter(): void {
  pushed.length = 0;
}
