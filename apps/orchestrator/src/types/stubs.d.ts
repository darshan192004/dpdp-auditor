declare module 'dockerode' {
  class Container {
    inspect(): Promise<Record<string, unknown>>;
    start(): Promise<void>;
    logs(options?: Record<string, unknown>): NodeJS.ReadableStream;
    remove(options?: Record<string, unknown>): Promise<void>;
  }

  export default class Docker {
    constructor(options?: Record<string, unknown>);
    createContainer(options: Record<string, unknown>): Promise<Container>;
    getContainer(id: string): Container;
  }
}
