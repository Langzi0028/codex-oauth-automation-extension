// phone-sms/providers/smsbower.js — SMSBower 接码平台适配层
(function attachSmsBowerProvider(root, factory) {
  root.PhoneSmsBowerProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSmsBowerProviderModule() {
  const PROVIDER_ID = 'smsbower';
  const DEFAULT_BASE_URL = 'https://smsbower.page/stubs/handler_api.php';
  const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
  const DEFAULT_MAX_USES = 1;

  function parsePayload(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return '';
    }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  function describePayload(raw) {
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (raw && typeof raw === 'object') {
      const direct = String(raw.message || raw.msg || raw.error || raw.title || raw.status || '').trim();
      if (direct) {
        return direct;
      }
      try {
        return JSON.stringify(raw);
      } catch {
        return String(raw);
      }
    }
    return String(raw || '').trim();
  }

  function normalizeSmsBowerServiceCode(value = '') {
    return String(value || '').trim();
  }

  function normalizeSmsBowerCountryId(value = '', fallback = '') {
    const normalized = String(value ?? '').trim();
    if (/^\d+$/.test(normalized)) {
      return normalized;
    }
    const fallbackText = String(fallback ?? '').trim();
    return /^\d+$/.test(fallbackText) ? fallbackText : '';
  }

  function normalizeSmsBowerCountryLabel(value = '', fallback = '') {
    return String(value || '').trim() || String(fallback || '').trim();
  }

  function normalizeSmsBowerCountryOrder(value = []) {
    const source = Array.isArray(value)
      ? value
      : String(value || '')
        .split(/[\r\n,，;；]+/)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    const normalized = [];
    const seen = new Set();
    source.forEach((entry) => {
      const id = normalizeSmsBowerCountryId(
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry.id || entry.countryId || entry.country || '')
          : entry,
        ''
      );
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      normalized.push(id);
    });
    return normalized.slice(0, 10);
  }

  function normalizeSmsBowerMaxPrice(value = '') {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
      return '';
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return '';
    }
    return String(Math.round(numeric * 10000) / 10000);
  }

  function normalizePositiveInteger(value, fallback) {
    const numeric = Math.floor(Number(value));
    if (!Number.isFinite(numeric) || numeric < 0) {
      return fallback;
    }
    return numeric;
  }

  function normalizeBaseEndpoint(value = '') {
    const trimmed = String(value || '').trim() || DEFAULT_BASE_URL;
    try {
      const url = new URL(trimmed);
      return url.toString();
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  function resolveApiKey(state = {}) {
    return String(state.smsBowerApiKey || state.smsbowerApiKey || '').trim();
  }

  function resolveConfig(state = {}, deps = {}) {
    return {
      apiKey: resolveApiKey(state),
      baseUrl: normalizeBaseEndpoint(state.smsBowerBaseUrl),
      fetchImpl: deps.fetchImpl,
      requestTimeoutMs: deps.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
  }

  function buildUrl(config = {}, query = {}) {
    const url = new URL(normalizeBaseEndpoint(config.baseUrl));
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function createSafeError(message, _payload) {
    const error = new Error(message);
    return error;
  }

  async function fetchSmsBower(state = {}, deps = {}, query = {}, actionLabel = 'SMSBower request') {
    const config = resolveConfig(state, deps);
    if (!config.apiKey) {
      throw new Error('Missing SMSBower API key.');
    }
    if (typeof config.fetchImpl !== 'function') {
      throw new Error('SMSBower fetch implementation is unavailable.');
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), Number(config.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await config.fetchImpl(buildUrl(config, { ...query, api_key: config.apiKey }), {
        method: 'GET',
        signal: controller?.signal,
      });
      const text = await response.text();
      const payload = parsePayload(text);
      if (!response.ok) {
        const error = createSafeError(`${actionLabel} failed with HTTP status ${response.status}.`, payload);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`${actionLabel} timed out.`);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  function parseAccessBalance(payload) {
    const text = describePayload(payload);
    const match = text.match(/^ACCESS_BALANCE:([0-9]+(?:\.[0-9]+)?)$/i);
    if (!match) {
      throw createSafeError('SMSBower balance response was malformed.', payload);
    }
    return Number(match[1]);
  }

  async function fetchBalance(state = {}, deps = {}) {
    const payload = await fetchSmsBower(state, deps, { action: 'getBalance' }, 'SMSBower balance request');
    return {
      balance: parseAccessBalance(payload),
      raw: payload,
    };
  }

  function getCountryIdFromRecord(record = {}, fallback = '') {
    return normalizeSmsBowerCountryId(
      record.countryCode ?? record.countryId ?? record.country,
      fallback
    );
  }

  function getCountryLabelFromRecord(record = {}, fallbackLabel = '', fallbackId = '') {
    const direct = normalizeSmsBowerCountryLabel(record.countryLabel || record.countryName, '');
    if (direct) {
      return direct;
    }
    const countryId = getCountryIdFromRecord(record, fallbackId);
    return normalizeSmsBowerCountryLabel(fallbackLabel, countryId);
  }

  function normalizeSmsBowerActivation(record, fallback = {}) {
    let activationId = '';
    let phoneNumber = '';
    let source = record;

    if (typeof record === 'string') {
      const match = record.trim().match(/^ACCESS_NUMBER:([^:]+):(.+)$/i);
      if (!match) {
        return null;
      }
      activationId = match[1];
      phoneNumber = match[2];
      source = {};
    } else if (record && typeof record === 'object' && !Array.isArray(record)) {
      activationId = String(record.activationId ?? record.id ?? '').trim();
      phoneNumber = String(record.phoneNumber ?? record.phone ?? record.number ?? '').trim();
    }

    activationId = String(activationId || '').trim();
    phoneNumber = String(phoneNumber || '').trim();
    if (!activationId || !phoneNumber) {
      return null;
    }

    const serviceCode = normalizeSmsBowerServiceCode(
      source.serviceCode ?? source.service ?? fallback.serviceCode
    );
    const countryId = getCountryIdFromRecord(source, fallback.countryId || '');
    const countryLabel = getCountryLabelFromRecord(source, fallback.countryLabel || countryId, countryId);
    const cost = Number(source.activationCost ?? source.cost ?? source.price);

    return {
      activationId,
      phoneNumber,
      provider: PROVIDER_ID,
      serviceCode,
      countryId,
      countryLabel,
      successfulUses: normalizePositiveInteger(source.successfulUses, 0),
      maxUses: Math.max(1, normalizePositiveInteger(source.maxUses, DEFAULT_MAX_USES)),
      ...(Number.isFinite(cost) ? { cost } : {}),
      ...(source.activationOperator || source.operator ? { operator: String(source.activationOperator || source.operator).trim() } : {}),
      ...(source.status ? { status: String(source.status) } : {}),
      ...(source.raw !== undefined ? { raw: source.raw } : {}),
    };
  }

  function resolveActivationConfig(state = {}) {
    const countryOrder = normalizeSmsBowerCountryOrder(state.smsBowerCountryOrder);
    const serviceCode = normalizeSmsBowerServiceCode(state.smsBowerServiceCode);
    const countryId = normalizeSmsBowerCountryId(state.smsBowerCountryId, countryOrder[0] || '');
    const countryLabel = normalizeSmsBowerCountryLabel(state.smsBowerCountryLabel, countryId);
    const maxPrice = normalizeSmsBowerMaxPrice(state.smsBowerMaxPrice);
    return { serviceCode, countryId, countryLabel, maxPrice };
  }

  async function requestActivation(state = {}, _options = {}, deps = {}) {
    const activationConfig = resolveActivationConfig(state);
    if (!activationConfig.serviceCode) {
      throw new Error('SMSBower service code is required before requesting a number.');
    }
    const payload = await fetchSmsBower(state, deps, {
      action: 'getNumber',
      service: activationConfig.serviceCode,
      country: activationConfig.countryId,
      maxPrice: activationConfig.maxPrice,
    }, 'SMSBower number request');
    const activation = normalizeSmsBowerActivation(payload, activationConfig);
    if (!activation) {
      throw createSafeError('SMSBower number response was malformed.', payload);
    }
    return activation;
  }

  function normalizeExistingActivation(activation = {}) {
    const normalized = normalizeSmsBowerActivation(activation, activation);
    if (normalized) {
      return normalized;
    }
    const activationId = String(activation?.activationId ?? activation?.id ?? '').trim();
    if (!activationId) {
      return null;
    }
    return {
      activationId,
      phoneNumber: String(activation?.phoneNumber ?? activation?.phone ?? '').trim(),
      provider: PROVIDER_ID,
      serviceCode: normalizeSmsBowerServiceCode(activation?.serviceCode || activation?.service),
      countryId: normalizeSmsBowerCountryId(activation?.countryId || activation?.countryCode, ''),
      countryLabel: normalizeSmsBowerCountryLabel(activation?.countryLabel, activation?.countryId || activation?.countryCode),
      successfulUses: normalizePositiveInteger(activation?.successfulUses, 0),
      maxUses: Math.max(1, normalizePositiveInteger(activation?.maxUses, DEFAULT_MAX_USES)),
    };
  }

  function extractVerificationCode(rawCodeOrText) {
    const trimmed = String(rawCodeOrText || '').trim();
    if (!trimmed) {
      return '';
    }
    const digitMatch = trimmed.match(/\b(\d{4,8})\b/);
    return digitMatch?.[1] || trimmed;
  }

  function parseStatus(payload) {
    const text = describePayload(payload);
    const separatorIndex = text.indexOf(':');
    return {
      text,
      status: String(separatorIndex >= 0 ? text.slice(0, separatorIndex) : text).trim().toUpperCase(),
      detail: separatorIndex >= 0 ? text.slice(separatorIndex + 1).trim() : '',
    };
  }

  async function pollActivationCode(state = {}, activation, options = {}, deps = {}) {
    const normalizedActivation = normalizeExistingActivation(activation);
    if (!normalizedActivation) {
      throw new Error('Missing SMSBower activation order.');
    }
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 180000);
    const intervalMs = Math.max(1, Number(options.intervalMs) || 5000);
    const maxRoundsRaw = Math.floor(Number(options.maxRounds));
    const maxRounds = Number.isFinite(maxRoundsRaw) && maxRoundsRaw > 0 ? maxRoundsRaw : 0;
    const start = Date.now();
    let pollCount = 0;
    let lastStatus = '';

    while (Date.now() - start < timeoutMs) {
      if (maxRounds > 0 && pollCount >= maxRounds) {
        break;
      }
      deps.throwIfStopped?.();
      const payload = await fetchSmsBower(state, deps, {
        action: 'getStatus',
        id: normalizedActivation.activationId,
      }, 'SMSBower status request');
      pollCount += 1;
      const statusInfo = parseStatus(payload);
      lastStatus = statusInfo.text;

      if (typeof options.onStatus === 'function') {
        await options.onStatus({
          activation: normalizedActivation,
          elapsedMs: Date.now() - start,
          pollCount,
          statusText: lastStatus || 'UNKNOWN',
          timeoutMs,
        });
      }

      if (statusInfo.status === 'STATUS_OK') {
        const code = extractVerificationCode(statusInfo.detail);
        if (code) {
          return code;
        }
        throw createSafeError('SMSBower status response did not include a verification code.', payload);
      }
      if (statusInfo.status === 'STATUS_CANCEL') {
        throw new Error('SMSBower activation was canceled.');
      }
      if (statusInfo.status === 'STATUS_WAIT_CODE' || statusInfo.status === 'STATUS_WAIT_RETRY') {
        if (typeof options.onWaitingForCode === 'function') {
          await options.onWaitingForCode({
            activation: normalizedActivation,
            elapsedMs: Date.now() - start,
            pollCount,
            statusText: lastStatus || 'UNKNOWN',
            timeoutMs,
          });
        }
        await deps.sleepWithStop?.(intervalMs);
        continue;
      }
      throw createSafeError('SMSBower status response was malformed.', payload);
    }

    const suffix = lastStatus ? ` SMSBower last status: ${lastStatus}` : '';
    throw new Error(`PHONE_CODE_TIMEOUT::Waiting for SMSBower verification code timed out.${suffix}`);
  }

  async function setActivationStatus(state = {}, activation, status, deps = {}) {
    const normalizedActivation = normalizeExistingActivation(activation);
    if (!normalizedActivation) {
      return '';
    }
    const payload = await fetchSmsBower(state, deps, {
      action: 'setStatus',
      id: normalizedActivation.activationId,
      status,
    }, 'SMSBower status update request');
    return describePayload(payload);
  }

  function finishActivation(state = {}, activation, deps = {}) {
    return setActivationStatus(state, activation, '6', deps);
  }

  function cancelActivation(state = {}, activation, deps = {}) {
    return setActivationStatus(state, activation, '8', deps);
  }

  function banActivation(state = {}, activation, deps = {}) {
    return setActivationStatus(state, activation, '8', deps);
  }

  async function fetchCountries(state = {}, deps = {}) {
    return fetchSmsBower(state, deps, { action: 'getCountries' }, 'SMSBower countries request');
  }

  async function fetchPrices(state = {}, _countryConfig = {}, deps = {}) {
    const activationConfig = resolveActivationConfig(state);
    return fetchSmsBower(state, deps, {
      action: 'getPrices',
      service: activationConfig.serviceCode,
      country: activationConfig.countryId,
    }, 'SMSBower prices request');
  }

  async function fetchServicesList(state = {}, deps = {}) {
    return fetchSmsBower(state, deps, { action: 'getServicesList' }, 'SMSBower services request');
  }

  function createProvider(deps = {}) {
    const providerDeps = {
      fetchImpl: deps.fetchImpl,
      sleepWithStop: deps.sleepWithStop,
      throwIfStopped: deps.throwIfStopped,
      requestTimeoutMs: deps.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
    return {
      id: PROVIDER_ID,
      label: 'SMSBower',
      baseUrl: DEFAULT_BASE_URL,
      normalizeServiceCode: normalizeSmsBowerServiceCode,
      normalizeCountryId: normalizeSmsBowerCountryId,
      normalizeCountryLabel: normalizeSmsBowerCountryLabel,
      normalizeMaxPrice: normalizeSmsBowerMaxPrice,
      normalizeActivation: normalizeSmsBowerActivation,
      extractVerificationCode,
      requestActivation: (state, options) => requestActivation(state, options, providerDeps),
      pollActivationCode: (state, activation, options) => pollActivationCode(state, activation, options, providerDeps),
      finishActivation: (state, activation) => finishActivation(state, activation, providerDeps),
      cancelActivation: (state, activation) => cancelActivation(state, activation, providerDeps),
      banActivation: (state, activation) => banActivation(state, activation, providerDeps),
      fetchBalance: (state) => fetchBalance(state, providerDeps),
      fetchCountries: (state) => fetchCountries(state, providerDeps),
      fetchPrices: (state, countryConfig) => fetchPrices(state, countryConfig, providerDeps),
      fetchServicesList: (state) => fetchServicesList(state, providerDeps),
      describePayload,
    };
  }

  return {
    PROVIDER_ID,
    DEFAULT_BASE_URL,
    createProvider,
    normalizeSmsBowerActivation,
    normalizeSmsBowerCountryOrder,
    normalizeSmsBowerCountryId,
    normalizeSmsBowerCountryLabel,
    normalizeSmsBowerMaxPrice,
    normalizeSmsBowerServiceCode,
  };
});
