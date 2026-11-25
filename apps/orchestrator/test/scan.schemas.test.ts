import { describe, expect, it } from 'vitest';

import { repoFactsSchema } from '../src/modules/scans/scan.schemas.js';

describe('repoFactsSchema', () => {
  it('accepts more than 500 distinct resource types without dropping them', () => {
    const resourceTypes = Array.from({ length: 501 }, (_, index) => `aws_resource_${index}`);

    const facts = repoFactsSchema.parse({
      languages: [],
      frameworks: [],
      resourceTypes,
    });

    expect(facts.resourceTypes).toEqual(resourceTypes);
  });
});
