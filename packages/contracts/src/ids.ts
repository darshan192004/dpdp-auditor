import { z } from 'zod';

export const ID_PREFIXES = ['org', 'usr', 'repo', 'scn', 'fnd', 'rpt', 'key', 'req'] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

export function idSchema<P extends IdPrefix>(
  prefix: P,
): z.ZodType<`${P}_${string}`, z.ZodTypeDef, string> {
  const pattern = new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`);
  return z
    .string()
    .regex(pattern, { message: `Must be a ${prefix}_ prefixed public ID.` }) as z.ZodType<
    `${P}_${string}`,
    z.ZodTypeDef,
    string
  >;
}
