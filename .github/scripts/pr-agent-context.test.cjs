const { test } = require('node:test');
const assert = require('node:assert/strict');
const resolve = require('./pr-agent-context.cjs');

const sha = 'a'.repeat(40);
function fixture(eventName = 'pull_request') {
  const outputs = {};
  const calls = [];
  const pr = { state: 'open', draft: false, head: { sha, repo: { full_name: 'owner/repo' } } };
  const args = {
    context: {
      eventName,
      repo: { owner: 'owner', repo: 'repo' },
      payload:
        eventName === 'pull_request'
          ? { pull_request: { number: 74 } }
          : {
              issue: { number: 74, pull_request: {} },
              sender: { type: 'User' },
              comment: { body: ' /review', author_association: 'COLLABORATOR' },
            },
    },
    core: {
      setOutput: (key, value) => {
        outputs[key] = value;
      },
      info: () => {},
    },
    github: {
      rest: {
        pulls: {
          get: async (input) => {
            calls.push(input);
            return { data: pr };
          },
        },
        repos: {
          getContent: async (input) => {
            calls.push(input);
            return { data: {} };
          },
        },
      },
    },
  };
  return { args, outputs, calls, pr };
}

for (const event of ['pull_request', 'issue_comment']) {
  test(`${event} resolves configuration by SHA without a head branch name`, async () => {
    const f = fixture(event);
    await resolve(f.args);
    assert.equal(f.outputs.review, 'true');
    assert.equal(f.outputs.config_sha, sha);
    assert.equal(f.calls[0].pull_number, 74);
    assert.equal(f.calls[1].ref, sha);
  });
}

for (const kind of ['closed', 'draft', 'fork', 'deleted-fork']) {
  test(`skips live ${kind} PRs before fetching configuration`, async () => {
    const f = fixture();
    if (kind === 'closed') f.pr.state = 'closed';
    if (kind === 'draft') f.pr.draft = true;
    if (kind === 'fork') f.pr.head.repo.full_name = 'other/repo';
    if (kind === 'deleted-fork') f.pr.head.repo = null;
    await resolve(f.args);
    assert.equal(f.outputs.review, 'false');
    assert.equal(f.calls.length, 1);
  });
}

for (const kind of ['bot', 'untrusted', 'ordinary', 'issue']) {
  test(`ignores ${kind} comments before making API calls`, async () => {
    const f = fixture('issue_comment');
    if (kind === 'bot') f.args.context.payload.sender.type = 'Bot';
    if (kind === 'untrusted') f.args.context.payload.comment.author_association = 'NONE';
    if (kind === 'ordinary') f.args.context.payload.comment.body = 'Thanks!';
    if (kind === 'issue') delete f.args.context.payload.issue.pull_request;
    await resolve(f.args);
    assert.equal(f.outputs.review, 'false');
    assert.equal(f.calls.length, 0);
  });
}

test('configuration read failures fail closed', async () => {
  const f = fixture();
  f.args.github.rest.repos.getContent = async () => {
    throw new Error('missing config');
  };
  await assert.rejects(resolve(f.args), /missing config/);
  assert.equal(f.outputs.review, 'false');
});
