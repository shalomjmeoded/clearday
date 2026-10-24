export enum ExecutionEnvironment {
  Bare = 'bare',
  Standalone = 'standalone',
  StoreClient = 'storeClient',
}

export default {
  executionEnvironment: ExecutionEnvironment.Bare,
  expoConfig: { version: '9.9.9-test' },
};
