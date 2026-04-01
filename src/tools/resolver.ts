import { ValidationError } from '../errors.js';

/**
 * Resolve a validator by moniker (name) or address.
 * If the input looks like a bech32 validator address, returns it as-is.
 * Otherwise queries the validator set and matches by moniker (case-insensitive).
 */
export async function resolveValidatorAddress(ctx: any, input: string): Promise<string> {
  if (input.startsWith('initvaloper') || input.startsWith('0x')) return input;

  const result = await ctx.client.mstaking.validators({});
  const validators = result.validators ?? result;
  const lower = input.toLowerCase();
  const match = (validators as any[]).find(
    (v: any) => v.description?.moniker?.toLowerCase() === lower,
  );
  if (!match) {
    const available = (validators as any[])
      .slice(0, 10)
      .map((v: any) => v.description?.moniker)
      .filter(Boolean)
      .join(', ');
    throw new ValidationError(
      `Validator "${input}" not found. Use validator_list to see available validators. Examples: ${available}`,
    );
  }
  return match.operatorAddress;
}
