import { registry } from './registry.js';
import { success } from '../response.js';
import { LedgerSignError } from '../errors.js';
import { LEDGER_SIGN_TIMEOUT } from './tx-executor.js';

registry.register({
  name: 'ledger_status',
  group: 'ledger',
  description: 'Check signer key type and Ledger device status',
  schema: {},
  annotations: { readOnlyHint: true },
  handler: async (_params, { chainManager, config }) => {
    const keyType = config.key.type;

    if (keyType !== 'ledger') {
      return success({ keyType, ledger: null });
    }

    const info = await chainManager.getLedgerInfo();
    return success({ keyType: 'ledger', ledger: info ?? { connected: false } });
  },
});

registry.register({
  name: 'ledger_verify_address',
  group: 'ledger',
  description: 'Display address on Ledger device for physical verification',
  schema: {},
  annotations: { readOnlyHint: true },
  handler: async (_params, { chainManager, config }) => {
    chainManager.requireSigner();

    if (config.key.type !== 'ledger') {
      return success({ verified: false, reason: 'Not using Ledger key.' });
    }

    const address = await Promise.race([
      chainManager.ledgerShowAddress(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new LedgerSignError('Address verification timed out.')),
          LEDGER_SIGN_TIMEOUT,
        ),
      ),
    ]);

    return success({ verified: true, address });
  },
});
