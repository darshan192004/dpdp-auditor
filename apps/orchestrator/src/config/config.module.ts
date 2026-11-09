import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ENV, loadEnv, type Env } from './env.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env = loadEnv()): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
