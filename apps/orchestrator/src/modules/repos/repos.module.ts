import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import {
  defaultGithubFetch,
  defaultGitRunner,
  GITHUB_FETCH,
  GIT_RUNNER,
  RepoResolverService,
} from './repo-resolver.service.js';
import { RepositoriesRepository } from './repositories.repository.js';
import { ReposService } from './repos.service.js';

@Module({
  imports: [IdentityModule],
  providers: [
    ReposService,
    RepositoriesRepository,
    RepoResolverService,
    { provide: GIT_RUNNER, useValue: defaultGitRunner },
    { provide: GITHUB_FETCH, useValue: defaultGithubFetch },
  ],
  exports: [ReposService, RepositoriesRepository, RepoResolverService],
})
export class ReposModule {}
