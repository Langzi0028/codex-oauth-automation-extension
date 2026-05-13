const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('phone-sms/providers/smsbower.js', 'utf8');
const api = new Function('self', `${source}; return self.PhoneSmsBowerProvider;`)({});
const registrySource = fs.readFileSync('phone-sms/providers/registry.js', 'utf8');

function createTextResponse(payload, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };
}

test('SMSBower provider fetches balance with api key and parses ACCESS_BALANCE', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: new URL(url), options });
      return createTextResponse('ACCESS_BALANCE:12.34');
    },
  });

  const balance = await provider.fetchBalance({ smsBowerApiKey: 'demo-key' });

  assert.equal(requests[0].url.origin, 'https://smsbower.page');
  assert.equal(requests[0].url.pathname, '/stubs/handler_api.php');
  assert.equal(requests[0].url.searchParams.get('action'), 'getBalance');
  assert.equal(requests[0].url.searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(balance.balance, 12.34);
  assert.equal(balance.raw, 'ACCESS_BALANCE:12.34');
});

test('SMSBower provider rejects malformed balance responses without leaking request details', async () => {
  const provider = api.createProvider({
    fetchImpl: async () => createTextResponse('BROKEN demo-key https://smsbower.page/stubs/handler_api.php?api_key=demo-key'),
  });

  await assert.rejects(
    () => provider.fetchBalance({ smsBowerApiKey: 'demo-key' }),
    (error) => {
      assert.match(error.message, /balance/i);
      assert.doesNotMatch(error.message, /demo-key/);
      assert.doesNotMatch(error.message, /smsbower\.page/);
      assert.equal(Object.prototype.hasOwnProperty.call(error, 'payload'), false);
      return true;
    }
  );
});

test('SMSBower provider requests activation with configurable service, numeric country, and max price', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: new URL(url), options });
      return createTextResponse('ACCESS_NUMBER:111:79991234567');
    },
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'ot',
    smsBowerCountryId: '7',
    smsBowerCountryLabel: 'Kazakhstan',
    smsBowerMaxPrice: '0.35',
  });

  assert.equal(requests[0].url.searchParams.get('action'), 'getNumber');
  assert.equal(requests[0].url.searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[0].url.searchParams.get('service'), 'ot');
  assert.equal(requests[0].url.searchParams.get('country'), '7');
  assert.equal(requests[0].url.searchParams.get('maxPrice'), '0.35');
  assert.equal(activation.activationId, '111');
  assert.equal(activation.phoneNumber, '79991234567');
  assert.equal(activation.provider, 'smsbower');
  assert.equal(activation.serviceCode, 'ot');
  assert.equal(activation.countryId, '7');
  assert.equal(activation.countryLabel, 'Kazakhstan');
  assert.equal(activation.successfulUses, 0);
  assert.equal(activation.maxUses, 1);
});

test('SMSBower provider requests activation with a single providerIds value when configured', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return createTextResponse('ACCESS_NUMBER:provider-3:79991234567');
    },
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'ot',
    smsBowerCountryId: '7',
    smsBowerProviderId: '3',
  });

  assert.equal(requests[0].searchParams.get('providerIds'), '3');
  assert.doesNotMatch(requests[0].search, /providerIds=3%2C5/);
  assert.equal(activation.activationId, 'provider-3');
});

test('SMSBower provider normalizes per-country provider id mappings', () => {
  const normalized = api.normalizeSmsBowerCountryProviderIds(' 6 : 3,5\n7:8,8\n6:5,9\nabc\n1:x,2 ');

  assert.deepStrictEqual(normalized, [
    { countryId: 6, providerIds: ['3', '5', '9'] },
    { countryId: 7, providerIds: ['8'] },
    { countryId: 1, providerIds: ['2'] },
  ]);
  assert.equal(api.formatSmsBowerCountryProviderIds(normalized), '6:3,5,9\n7:8\n1:2');
  assert.deepStrictEqual(api.normalizeSmsBowerCountryProviderIds(''), []);
  assert.equal(api.formatSmsBowerCountryProviderIds(''), '');
});

test('SMSBower provider classifies number request supply and terminal errors', async () => {
  const retryableProvider = api.createProvider({
    fetchImpl: async () => createTextResponse('NO_NUMBERS'),
  });
  const terminalProvider = api.createProvider({
    fetchImpl: async () => createTextResponse('BAD_KEY'),
  });
  const state = {
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'ot',
    smsBowerCountryId: '7',
  };

  await assert.rejects(
    () => retryableProvider.requestActivation(state),
    (error) => {
      assert.equal(error.smsBowerRetryable, true);
      assert.equal(error.smsBowerTerminal, false);
      assert.doesNotMatch(error.message, /demo-key/);
      assert.doesNotMatch(error.message, /smsbower\.page/);
      return true;
    }
  );
  await assert.rejects(
    () => terminalProvider.requestActivation(state),
    (error) => {
      assert.equal(error.smsBowerTerminal, true);
      assert.equal(error.smsBowerRetryable, false);
      assert.match(error.message, /BAD_KEY|API key/i);
      return true;
    }
  );
});

test('SMSBower provider uses the first configured country order entry when no legacy country id is set', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return createTextResponse('ACCESS_NUMBER:112:79991230000');
    },
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'ot',
    smsBowerCountryOrder: [6, 7],
  });

  assert.equal(requests[0].searchParams.get('country'), '6');
  assert.equal(activation.countryId, '6');
  assert.equal(activation.countryLabel, '6');
});

test('SMSBower provider rejects missing service code before requesting a number', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      requests.push(url);
      throw new Error(`unexpected request ${url}`);
    },
  });

  await assert.rejects(
    () => provider.requestActivation({ smsBowerApiKey: 'demo-key' }),
    /SMSBower service code/i
  );
  assert.deepStrictEqual(requests, []);
});

test('SMSBower provider normalizes JSON activation payloads', async () => {
  const provider = api.createProvider({
    fetchImpl: async () => createTextResponse({
      activationId: 222,
      phoneNumber: '+15551234567',
      activationCost: '1.25',
      countryCode: 1,
      activationOperator: 'virtual4',
    }),
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'chatgpt',
    smsBowerCountryLabel: 'United States',
  });

  assert.equal(activation.activationId, '222');
  assert.equal(activation.phoneNumber, '+15551234567');
  assert.equal(activation.provider, 'smsbower');
  assert.equal(activation.serviceCode, 'chatgpt');
  assert.equal(activation.cost, 1.25);
  assert.equal(activation.countryId, '1');
  assert.equal(activation.countryLabel, 'United States');
  assert.equal(activation.operator, 'virtual4');
});

test('SMSBower provider polling waits on pending statuses and parses final code', async () => {
  const requests = [];
  const sleeps = [];
  let stopChecks = 0;
  const statuses = ['STATUS_WAIT_CODE', 'STATUS_WAIT_RETRY:654321', 'STATUS_OK:123456'];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return createTextResponse(statuses.shift());
    },
    sleepWithStop: async (ms) => sleeps.push(ms),
    throwIfStopped: () => { stopChecks += 1; },
  });

  const code = await provider.pollActivationCode(
    { smsBowerApiKey: 'demo-key' },
    { activationId: '111', phoneNumber: '79991234567', serviceCode: 'ot' },
    { timeoutMs: 5000, intervalMs: 25, maxRounds: 3 }
  );

  assert.equal(code, '123456');
  assert.deepStrictEqual(sleeps, [25, 25]);
  assert.equal(stopChecks, 3);
  assert.deepStrictEqual(
    requests.map((url) => [url.searchParams.get('action'), url.searchParams.get('id')]),
    [['getStatus', '111'], ['getStatus', '111'], ['getStatus', '111']]
  );
});

test('SMSBower provider polling extracts digits from STATUS_OK text', async () => {
  const provider = api.createProvider({
    fetchImpl: async () => createTextResponse('STATUS_OK:Your code is 123456'),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const code = await provider.pollActivationCode(
    { smsBowerApiKey: 'demo-key' },
    { activationId: '111', phoneNumber: '79991234567', serviceCode: 'ot' },
    { timeoutMs: 1000, intervalMs: 1, maxRounds: 1 }
  );

  assert.equal(code, '123456');
});

test('SMSBower provider polling treats STATUS_CANCEL as terminal', async () => {
  const provider = api.createProvider({
    fetchImpl: async () => createTextResponse('STATUS_CANCEL'),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => provider.pollActivationCode(
      { smsBowerApiKey: 'demo-key' },
      { activationId: '111', phoneNumber: '79991234567', serviceCode: 'ot' },
      { timeoutMs: 1000, intervalMs: 1, maxRounds: 1 }
    ),
    /cancel/i
  );
});

test('SMSBower provider finishes, cancels, and bans activations through setStatus', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return createTextResponse('ACCESS_READY');
    },
  });
  const state = { smsBowerApiKey: 'demo-key' };
  const activation = { activationId: '111', phoneNumber: '79991234567', serviceCode: 'ot' };

  await provider.finishActivation(state, activation);
  await provider.cancelActivation(state, activation);
  await provider.banActivation(state, activation);

  assert.deepStrictEqual(
    requests.map((url) => [url.searchParams.get('action'), url.searchParams.get('id'), url.searchParams.get('status')]),
    [['setStatus', '111', '6'], ['setStatus', '111', '8'], ['setStatus', '111', '8']]
  );
});

test('SMSBower provider catalog helpers call prices, services, and countries actions', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      const action = parsed.searchParams.get('action');
      if (action === 'getPrices') {
        return createTextResponse({ 1: { ot: { cost: 1.25, count: 3 } } });
      }
      if (action === 'getServicesList') {
        return createTextResponse({ ot: 'OpenAI' });
      }
      if (action === 'getCountries') {
        return createTextResponse({ 1: 'United States', 7: 'Kazakhstan' });
      }
      throw new Error(`unexpected action ${action}`);
    },
  });
  const state = { smsBowerApiKey: 'demo-key', smsBowerServiceCode: 'ot', smsBowerCountryId: '1' };

  const prices = await provider.fetchPrices(state);
  const services = await provider.fetchServicesList(state);
  const countries = await provider.fetchCountries(state);

  assert.deepStrictEqual(prices, { 1: { ot: { cost: 1.25, count: 3 } } });
  assert.deepStrictEqual(services, { ot: 'OpenAI' });
  assert.deepStrictEqual(countries, { 1: 'United States', 7: 'Kazakhstan' });
  assert.equal(requests[0].searchParams.get('service'), 'ot');
  assert.equal(requests[0].searchParams.get('country'), '1');
  assert.equal(requests[0].searchParams.get('providerIds'), null);
  assert.deepStrictEqual(
    requests.map((url) => url.searchParams.get('action')),
    ['getPrices', 'getServicesList', 'getCountries']
  );
});

test('SMSBower provider fetches V3 provider statistics without endpoint provider filtering', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      assert.equal(parsed.searchParams.get('action'), 'getPricesV3');
      return createTextResponse({
        73: {
          zztest_service: [
            { provider_id: 67013, price: 0.059, count: 12 },
            { provider_id: 777, price: '0.071', count: '0' },
          ],
        },
      });
    },
  });

  const stats = await provider.fetchProviderStats({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'zztest_service',
    smsBowerCountryId: '73',
    smsBowerProviderId: '67013',
  });

  assert.equal(requests[0].searchParams.get('service'), 'zztest_service');
  assert.equal(requests[0].searchParams.get('country'), '73');
  assert.equal(requests[0].searchParams.get('providerIds'), null);
  assert.deepStrictEqual(stats, [
    { countryId: '73', serviceCode: 'zztest_service', providerId: '67013', price: 0.059, count: 12 },
    { countryId: '73', serviceCode: 'zztest_service', providerId: '777', price: 0.071, count: 0 },
  ]);
});

test('SMSBower provider does not treat V2 price tiers as provider statistics', async () => {
  const provider = api.createProvider({
    fetchImpl: async () => createTextResponse({
      73: {
        zztest_service: {
          '0.059': 67013,
        },
      },
    }),
  });

  const stats = await provider.fetchProviderStats({
    smsBowerApiKey: 'demo-key',
    smsBowerServiceCode: 'zztest_service',
    smsBowerCountryId: '73',
  });

  assert.deepStrictEqual(stats, []);
});

test('SMSBower provider is registered in phone SMS provider registry', () => {
  const root = {
    PhoneSmsBowerProvider: {
      createProvider: (deps) => ({ id: 'smsbower', deps }),
    },
    PhoneSmsFiveSimProvider: {
      createProvider: (deps) => ({ id: '5sim', deps }),
    },
    PhoneSmsHeroSmsProvider: {
      createProvider: (deps) => ({ id: 'hero-sms', deps }),
    },
  };
  const registry = new Function('self', `${registrySource}; return self.PhoneSmsProviderRegistry;`)(root);

  assert.equal(registry.normalizeProviderId('SMSBOWER'), 'smsbower');
  assert.equal(registry.normalizeProviderId('nexsms'), 'nexsms');
  assert.equal(registry.normalizeProviderId('unknown-provider'), 'hero-sms');
  assert.equal(registry.getProviderLabel('smsbower'), 'SMSBower');
  assert.equal(registry.getProviderLabel('nexsms'), 'NexSMS');
  assert.throws(() => registry.createProvider('nexsms'), /nexsms/);
  assert.equal(registry.createProvider('smsbower', { marker: true }).id, 'smsbower');
  assert.equal(registry.createProvider('smsbower', { marker: true }).deps.marker, true);
});
