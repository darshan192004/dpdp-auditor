// Resolve both PR events and issue comments through the live PR API. In
// particular, issue_comment has no github.head_ref, and branches can be deleted.
module.exports = async function resolve({ github, context, core }) {
  core.setOutput('review', 'false');
  const { payload, eventName, repo } = context;
  if (eventName === 'issue_comment') {
    const comment = payload.comment;
    if (
      !payload.issue?.pull_request ||
      payload.sender?.type === 'Bot' ||
      !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment?.author_association) ||
      !comment?.body?.trimStart().startsWith('/')
    ) {
      return;
    }
  } else if (eventName !== 'pull_request') {
    return;
  }

  const pull_number = payload.pull_request?.number ?? payload.issue?.number;
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number });
  if (pr.state !== 'open' || pr.draft || pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}`) {
    core.info('Skipping a closed, draft, or fork pull request.');
    return;
  }
  const sha = pr.head.sha;
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('The pull request has no immutable configuration revision.');
  }
  // Fail before model execution if the configured file cannot be read; never
  // silently fall back to a different provider because configuration was lost.
  await github.rest.repos.getContent({ ...repo, path: '.pr_agent.toml', ref: sha });
  core.setOutput('config_sha', sha);
  core.setOutput('review', 'true');
};
