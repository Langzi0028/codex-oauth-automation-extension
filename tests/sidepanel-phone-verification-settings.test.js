const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  normalizeIcloudForwardMailProvider,
  normalizeIcloudTargetMailboxType,
} = require('../mail-provider-utils');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (typeof start !== 'number' || start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

function extractLastFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.lastIndexOf(marker))
    .reduce((max, index) => Math.max(max, index), -1);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing function body ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

function extractOptionalFunction(name) {
  try {
    return extractFunction(name);
  } catch {
    return '';
  }
}

function createTestNode(tagName = 'div') {
  return {
    tagName: String(tagName || 'div').toUpperCase(),
    value: '',
    textContent: '',
    hidden: false,
    selected: false,
    dataset: {},
    style: {},
    children: [],
    classList: { toggle() {} },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    setAttribute(name, value) {
      this[name] = String(value);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    remove() {
      this.removed = true;
    },
  };
}

function createTestDocument() {
  return {
    createElement(tagName) {
      return createTestNode(tagName);
    },
  };
}

function createTestSelect(initialOptions = []) {
  const select = {
    value: '',
    multiple: true,
    options: initialOptions.map((entry) => ({
      ...createTestNode('option'),
      value: String(entry.value ?? entry.id ?? ''),
      textContent: String(entry.textContent ?? entry.label ?? ''),
      selected: Boolean(entry.selected),
    })),
    appendChild(option) {
      this.options.push(option);
      if (!this.value) {
        this.value = String(option.value || '');
      }
      return option;
    },
  };
  Object.defineProperty(select, 'innerHTML', {
    get() {
      return '';
    },
    set() {
      this.options = [];
      this.value = '';
    },
  });
  return select;
}

test('sidepanel html exposes phone verification toggle and multi-provider SMS rows', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-phone-verification-enabled"/);
  assert.match(html, /id="btn-toggle-phone-verification-section"/);
  assert.match(html, /id="row-phone-verification-fold"/);
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="row-signup-method"/);
  assert.match(html, /id="row-signup-phone"/);
  assert.match(html, /id="input-signup-phone"/);
  assert.ok(
    html.indexOf('id="row-signup-phone"') > html.indexOf('id="phone-verification-section"'),
    'signup phone runtime row should live inside the phone verification card'
  );
  assert.ok(
    html.indexOf('id="row-signup-phone"') > html.indexOf('id="row-hero-sms-runtime-pair"'),
    'signup phone runtime row should sit below the SMS order runtime row'
  );
  assert.ok(
    html.indexOf('id="row-signup-phone"') > html.indexOf('hero-sms-runtime-grid'),
    'signup phone runtime row should not be embedded in the SMS order runtime grid'
  );
  assert.match(html, /data-signup-method="email"/);
  assert.match(html, /data-signup-method="phone"/);
  assert.match(html, /id="row-phone-sms-provider"/);
  assert.match(html, /id="select-phone-sms-provider"/);
  assert.match(html, /id="row-phone-sms-provider-order"/);
  assert.match(html, /id="select-phone-sms-provider-order"[^>]*multiple/);
  assert.match(html, /id="btn-phone-sms-provider-order-menu"/);
  assert.match(html, /id="row-phone-sms-provider-order-actions"/);
  assert.match(html, /id="btn-phone-sms-provider-order-reset"/);
  assert.match(html, /id="row-hero-sms-platform"/);
  assert.match(html, /id="select-phone-sms-provider"/);
  assert.match(html, /\.\.\/phone-sms\/providers\/hero-sms\.js/);
  assert.match(html, /\.\.\/phone-sms\/providers\/five-sim\.js/);
  assert.match(html, /\.\.\/phone-sms\/providers\/registry\.js/);
  assert.match(html, /<option value="hero-sms">HeroSMS<\/option>/);
  assert.match(html, /<option value="5sim">5sim<\/option>/);
  assert.match(html, /id="row-hero-sms-country"/);
  assert.match(html, /id="row-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-country"[^>]*multiple/);
  assert.doesNotMatch(html, /id="select-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-api-key"/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="btn-phone-sms-balance"/);
  assert.match(html, /id="display-phone-sms-balance"/);
  assert.match(html, /id="row-five-sim-operator"/);
  assert.match(html, /id="input-five-sim-operator"/);
  assert.match(html, /id="row-hero-sms-current-number"/);
  assert.match(html, /id="row-hero-sms-current-countdown"/);
  assert.match(html, /id="row-hero-sms-price-tiers"/);
  assert.match(html, /id="row-hero-sms-current-code"/);
  assert.match(html, /id="row-hero-sms-preferred-activation"/);
  assert.match(html, /id="select-hero-sms-preferred-activation"/);
  assert.match(html, /id="row-free-phone-reuse-enabled"/);
  assert.match(html, /id="input-free-phone-reuse-enabled"/);
  assert.match(html, /id="row-free-phone-reuse-auto-enabled"/);
  assert.match(html, /id="input-free-phone-reuse-auto-enabled"/);
  assert.match(html, /id="row-free-reusable-phone"/);
  assert.match(html, /id="display-free-reusable-phone"/);
  assert.match(html, /id="display-free-reusable-phone-country"/);
  assert.match(html, /id="input-free-reusable-phone"/);
  assert.match(html, /id="btn-save-free-reusable-phone"/);
  assert.match(html, /id="btn-clear-free-reusable-phone"/);
  assert.match(html, /白嫖复用/);
  assert.match(html, /自动白嫖复用/);
  assert.match(html, /id="row-phone-replacement-limit"/);
  assert.match(html, /id="row-phone-verification-resend-count"/);
  assert.match(html, /id="row-phone-code-wait-seconds"/);
  assert.match(html, /id="row-phone-code-timeout-windows"/);
  assert.match(html, /id="row-phone-code-poll-interval-seconds"/);
  assert.match(html, /id="row-phone-code-poll-max-rounds"/);
  assert.match(html, /id="row-five-sim-api-key"/);
  assert.match(html, /id="input-five-sim-api-key"/);
  assert.match(html, /id="row-five-sim-country"/);
  assert.match(html, /id="select-five-sim-country"[^>]*multiple/);
  assert.match(html, /id="row-five-sim-country-fallback"/);
  assert.match(html, /id="row-five-sim-operator"/);
  assert.match(html, /id="input-five-sim-operator"/);
  assert.match(html, /id="row-five-sim-product"/);
  assert.match(html, /id="input-five-sim-product"/);
  assert.match(html, /<option value="nexsms">/);
  assert.match(html, /id="row-nex-sms-api-key"/);
  assert.match(html, /id="input-nex-sms-api-key"/);
  assert.match(html, /id="row-nex-sms-country"/);
  assert.match(html, /id="select-nex-sms-country"[^>]*multiple/);
  assert.match(html, /id="row-nex-sms-country-fallback"/);
  assert.match(html, /id="row-nex-sms-service-code"/);
  assert.match(html, /id="input-nex-sms-service-code"/);
  assert.doesNotMatch(html, /id="input-account-run-history-text-enabled"/);
});

test('sidepanel html wires SMSBower provider controls and loads it before registry', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  const smsBowerScriptIndex = html.indexOf('../phone-sms/providers/smsbower.js');
  const registryScriptIndex = html.indexOf('../phone-sms/providers/registry.js');
  assert.ok(smsBowerScriptIndex >= 0, 'SMSBower provider script should be loaded');
  assert.ok(registryScriptIndex >= 0, 'phone SMS registry script should be loaded');
  assert.ok(
    smsBowerScriptIndex < registryScriptIndex,
    'SMSBower provider script should load before the phone SMS registry'
  );

  assert.match(html, /<option value="smsbower">SMSBower<\/option>/);
  assert.match(html, /id="select-phone-sms-provider-order"[\s\S]*<option value="smsbower" selected>SMSBower<\/option>/);
  assert.match(html, /id="row-sms-bower-api-key"/);
  assert.match(html, /id="input-sms-bower-api-key"/);
  assert.match(html, /data-password-toggle="input-sms-bower-api-key"/);
  assert.match(html, /id="row-sms-bower-country"/);
  assert.match(html, /id="select-sms-bower-country"[^>]*multiple/);
  assert.match(html, /id="row-sms-bower-country-fallback"/);
  assert.match(html, /id="display-sms-bower-country-fallback-order"/);
  assert.match(html, /id="row-sms-bower-country-provider-ids"/);
  assert.match(html, /id="input-sms-bower-country-provider-ids"/);
  assert.match(html, /id="row-sms-bower-service-code"/);
  assert.match(html, /id="input-sms-bower-service-code"/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="input-hero-sms-max-price"/);
});

test('sidepanel source recognizes SMSBower settings, normalizers, labels, and password toggle wiring', () => {
  assert.match(sidepanelSource, /const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';/);
  assert.match(
    sidepanelSource,
    /DEFAULT_PHONE_SMS_PROVIDER_ORDER = Object\.freeze\(\[[\s\S]*PHONE_SMS_PROVIDER_SMSBOWER[\s\S]*\]\);/
  );
  assert.match(sidepanelSource, /const rowSmsBowerApiKey = document\.getElementById\('row-sms-bower-api-key'\);/);
  assert.match(sidepanelSource, /const inputSmsBowerApiKey = document\.getElementById\('input-sms-bower-api-key'\);/);
  assert.match(sidepanelSource, /const rowSmsBowerCountry = document\.getElementById\('row-sms-bower-country'\);/);
  assert.match(sidepanelSource, /const rowSmsBowerCountryProviderIds = document\.getElementById\('row-sms-bower-country-provider-ids'\);/);
  assert.match(sidepanelSource, /const selectSmsBowerCountry = document\.getElementById\('select-sms-bower-country'\);/);
  assert.match(sidepanelSource, /const rowSmsBowerServiceCode = document\.getElementById\('row-sms-bower-service-code'\);/);
  assert.match(sidepanelSource, /const inputSmsBowerServiceCode = document\.getElementById\('input-sms-bower-service-code'\);/);
  assert.match(sidepanelSource, /const inputSmsBowerCountryProviderIds = document\.getElementById\('input-sms-bower-country-provider-ids'\);/);
  assert.match(sidepanelSource, /function normalizeSmsBowerServiceCodeValue\(/);
  assert.match(sidepanelSource, /function normalizeSmsBowerCountryOrderValue\(/);
  assert.match(sidepanelSource, /function normalizeSmsBowerCountryProviderIdsValue\(/);
  assert.match(sidepanelSource, /smsBowerApiKey:/);
  assert.match(sidepanelSource, /smsBowerServiceCode:/);
  assert.match(sidepanelSource, /smsBowerCountryOrder:/);
  assert.match(sidepanelSource, /smsBowerCountryProviderIds:/);
  assert.match(sidepanelSource, /smsBowerMaxPrice:/);
  assert.match(sidepanelSource, /return 'SMSBower';/);
  assert.match(
    sidepanelSource,
    /inputSmsBowerApiKey\?\.addEventListener\('blur', \(\) => \{[\s\S]{0,700}loadSmsBowerCountries/
  );
});

test('collectSettingsPayload persists SMSBower settings from sidepanel inputs', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
const window = {};
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
  smsBowerCountryOrder: [1],
};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: '' };
const selectTempEmailDomain = { value: '' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const inputSub2ApiDefaultProxy = { value: '' };
const inputCodex2ApiUrl = { value: '' };
const inputCodex2ApiAdminKey = { value: '' };
const inputPassword = { value: '' };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: false };
const selectIcloudHostPreference = { value: 'auto' };
const inputMail2925UseAccountPool = { checked: false };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputHotmailRemoteBaseUrl = { value: '' };
const inputHotmailLocalBaseUrl = { value: '' };
const inputLuckmailApiKey = { value: '' };
const inputLuckmailBaseUrl = { value: '' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: '' };
const inputTempEmailBaseUrl = { value: '' };
const inputTempEmailAdminAuth = { value: '' };
const inputTempEmailCustomAuth = { value: '' };
const inputTempEmailReceiveMailbox = { value: '' };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '0' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '' };
const inputPhoneVerificationEnabled = { checked: true };
const inputFreePhoneReuseEnabled = { checked: false };
const inputFreePhoneReuseAutoEnabled = { checked: false };
const selectPhoneSmsProvider = { value: 'smsbower' };
const inputVerificationResendCount = { value: '4' };
const inputHeroSmsApiKey = { value: '' };
const inputFiveSimApiKey = { value: '' };
const inputFiveSimOperator = { value: 'any' };
const inputFiveSimProduct = { value: 'openai' };
const inputNexSmsApiKey = { value: '' };
const inputNexSmsServiceCode = { value: 'ot' };
const inputSmsBowerApiKey = { value: 'demo-key' };
const inputSmsBowerServiceCode = { value: 'ot' };
const inputSmsBowerCountryProviderIds = { value: '6:3,5\\n7:8,8\\n6:5,9' };
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'country' };
const inputHeroSmsMaxPrice = { value: '0.35' };
const inputHeroSmsPreferredPrice = { value: '' };
const inputPhoneReplacementLimit = { value: '3' };
const inputPhoneCodeWaitSeconds = { value: '60' };
const inputPhoneCodeTimeoutWindows = { value: '2' };
const inputPhoneCodePollIntervalSeconds = { value: '5' };
const inputPhoneCodePollMaxRounds = { value: '4' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_PHONE_CODE_POLL_MAX_ROUNDS = 4;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const PHONE_CODE_POLL_MAX_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_MAX_ROUNDS_MAX = 120;
const DEFAULT_HERO_SMS_REUSE_ENABLED = true;
const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
const DEFAULT_HERO_SMS_ACQUIRE_PRIORITY = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_HERO = PHONE_SMS_PROVIDER_HERO_SMS;
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO_SMS;
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_FIVE_SIM_PRODUCT = 'openai';
const DEFAULT_NEX_SMS_COUNTRY_ORDER = [1];
const DEFAULT_NEX_SMS_SERVICE_CODE = 'ot';
const DEFAULT_SMS_BOWER_COUNTRY_ORDER = [];
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const selectHeroSmsCountry = { value: '52', selectedIndex: 0, options: [{ textContent: 'Thailand' }] };
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedPlusPaymentMethod() { return 'paypal'; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedHotmailServiceMode() { return 'local'; }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim() || 'ms_graph'; }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number(value) || fallback; }
function getSelectedPhonePreferredActivation() { return null; }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizeFiveSimCountryCode')}
${extractFunction('normalizeFiveSimCountryOrderValue')}
${extractFunction('normalizeFiveSimProductValue')}
${extractFunction('normalizeNexSmsCountryIdValue')}
${extractFunction('normalizeNexSmsCountryOrderValue')}
${extractFunction('normalizeNexSmsServiceCodeValue')}
${extractFunction('normalizeSmsBowerCountryIdValue')}
${extractFunction('normalizeSmsBowerCountryOrderValue')}
${extractFunction('normalizeSmsBowerCountryProviderIdsValue')}
${extractFunction('normalizeSmsBowerServiceCodeValue')}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProvider(selectPhoneSmsProvider?.value || latestState?.phoneSmsProvider); }
function getSelectedPhoneSmsProviderOrder() { return ['smsbower', 'nexsms']; }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizePhoneVerificationReplacementLimit')}
${extractFunction('normalizePhoneCodeWaitSecondsValue')}
${extractFunction('normalizePhoneCodeTimeoutWindowsValue')}
${extractFunction('normalizePhoneCodePollIntervalSecondsValue')}
${extractFunction('normalizePhoneCodePollMaxRoundsValue')}
${extractFunction('normalizeHeroSmsReuseEnabledValue')}
${extractFunction('normalizeHeroSmsAcquirePriority')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('getSelectedHeroSmsCountryOption')}
function syncHeroSmsFallbackSelectionOrderFromSelect() { return []; }
function getSelectedSignupMethod() { return 'phone'; }
${extractFunction('normalizePanelMode')}
${extractFunction('getSelectedPanelMode')}
function getSelectedFiveSimCountries() { return []; }
function getSelectedNexSmsCountries() { return []; }
function getSelectedSmsBowerCountries() { return [{ id: 6, label: 'Country #6' }, { id: 7, label: 'Country #7' }]; }
${extractFunction('normalizeFiveSimCountryFallbackList')}
${extractFunction('normalizeHeroSmsCountryFallbackList')}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.phoneSmsProvider, 'smsbower');
  assert.deepStrictEqual(payload.phoneSmsProviderOrder, ['smsbower', 'nexsms']);
  assert.equal(payload.smsBowerApiKey, 'demo-key');
  assert.equal(payload.smsBowerServiceCode, 'ot');
  assert.deepStrictEqual(payload.smsBowerCountryOrder, [6, 7]);
  assert.equal(payload.smsBowerCountryProviderIds, '6:3,5,9\n7:8');
  assert.equal(payload.smsBowerMaxPrice, '0.35');
});

test('provider order summary can include SMSBower', () => {
  const api = new Function(`
const window = {};
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_HERO_SMS = PHONE_SMS_PROVIDER_HERO;
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
${extractFunction('getPhoneSmsProviderLabel')}
${extractFunction('formatPhoneSmsProviderOrderSummary')}
return { formatPhoneSmsProviderOrderSummary };
`)();

  assert.equal(
    api.formatPhoneSmsProviderOrderSummary(['smsbower', 'nexsms']),
    '1. SMSBower → 2. NexSMS'
  );
});

test('provider order summary keeps all four providers and runtime SMSBower label', () => {
  const api = new Function(`
const window = {};
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_HERO_SMS = PHONE_SMS_PROVIDER_HERO;
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_PHONE_SMS_PROVIDER_ORDER = Object.freeze([
  PHONE_SMS_PROVIDER_HERO,
  PHONE_SMS_PROVIDER_FIVE_SIM,
  PHONE_SMS_PROVIDER_NEXSMS,
  PHONE_SMS_PROVIDER_SMSBOWER,
]);
const displayPhoneSmsProviderOrder = { textContent: '' };
const btnPhoneSmsProviderOrderMenu = { textContent: '' };
${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
${extractLastFunction('getPhoneSmsProviderLabel')}
${extractFunction('formatPhoneSmsProviderOrderSummary')}
${extractFunction('updatePhoneSmsProviderOrderSummary')}
return {
  normalizePhoneSmsProviderOrderValue,
  formatPhoneSmsProviderOrderSummary,
  updatePhoneSmsProviderOrderSummary,
  getButtonText: () => btnPhoneSmsProviderOrderMenu.textContent,
};
`)();

  const fullOrder = ['hero-sms', '5sim', 'nexsms', 'smsbower'];
  assert.deepStrictEqual(api.normalizePhoneSmsProviderOrderValue(fullOrder, []), fullOrder);
  assert.equal(
    api.formatPhoneSmsProviderOrderSummary(fullOrder),
    '1. HeroSMS → 2. 5sim → 3. NexSMS → 4. SMSBower'
  );

  api.updatePhoneSmsProviderOrderSummary(['smsbower']);
  assert.equal(api.getButtonText(), 'SMSBower (1/4)');
});

test('provider normalization keeps local SMSBower value when registry is stale', () => {
  const api = new Function(`
const window = {
  PhoneSmsProviderRegistry: {
    normalizeProviderId(value) {
      return String(value || '').trim().toLowerCase() === '5sim' ? '5sim' : 'hero-sms';
    },
  },
};
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_HERO_SMS = PHONE_SMS_PROVIDER_HERO;
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
${extractFunction('normalizePhoneSmsProvider')}
return { normalizePhoneSmsProvider };
`)();

  assert.equal(api.normalizePhoneSmsProvider('smsbower'), 'smsbower');
  assert.equal(api.normalizePhoneSmsProvider('nexsms'), 'nexsms');
});

test('sidepanel source wires free reusable phone save and clear actions to runtime messages', () => {
  assert.match(sidepanelSource, /const inputFreePhoneReuseEnabled = document\.getElementById\('input-free-phone-reuse-enabled'\);/);
  assert.match(sidepanelSource, /const inputFreePhoneReuseAutoEnabled = document\.getElementById\('input-free-phone-reuse-auto-enabled'\);/);
  assert.match(sidepanelSource, /const displayFreeReusablePhone = document\.getElementById\('display-free-reusable-phone'\);/);
  assert.match(sidepanelSource, /const inputFreeReusablePhone = document\.getElementById\('input-free-reusable-phone'\);/);
  assert.match(sidepanelSource, /const btnSaveFreeReusablePhone = document\.getElementById\('btn-save-free-reusable-phone'\);/);
  assert.match(sidepanelSource, /const btnClearFreeReusablePhone = document\.getElementById\('btn-clear-free-reusable-phone'\);/);
  assert.match(sidepanelSource, /type:\s*'SET_FREE_REUSABLE_PHONE'/);
  assert.match(sidepanelSource, /payload:\s*\{\s*phoneNumber\s*\}/s);
  assert.match(sidepanelSource, /type:\s*'CLEAR_FREE_REUSABLE_PHONE'/);
});

test('sidepanel keeps free reuse switches realtime and locks them during auto run', () => {
  assert.match(
    sidepanelSource,
    /message\.payload\.freePhoneReuseEnabled !== undefined[\s\S]*updatePhoneVerificationSettingsUI\(\);/
  );
  assert.match(
    sidepanelSource,
    /message\.payload\.freePhoneReuseAutoEnabled !== undefined[\s\S]*updatePhoneVerificationSettingsUI\(\);/
  );
  assert.match(sidepanelSource, /setFreePhoneReuseControlsLocked\(settingsCardLocked\);/);
  assert.match(
    sidepanelSource,
    /inputFreePhoneReuseEnabled\.disabled = locked;[\s\S]*inputFreePhoneReuseAutoEnabled\.disabled = locked/
  );
});

test('sidepanel free reusable phone paths avoid stale identifiers and empty-save errors', () => {
  assert.doesNotMatch(
    sidepanelSource,
    /applyHeroSmsFallbackSelection\(\s*\[\.\.\.nextPrimaryCountries,\s*\.\.\.nextFallback\]/
  );
  assert.match(
    sidepanelSource,
    /applyHeroSmsFallbackSelection\(\s*\[\s*nextPrimary,\s*\.\.\.nextFallback\]/
  );
  assert.match(
    sidepanelSource,
    /if \(!phoneNumber\) \{[\s\S]*请先填写白嫖复用手机号[\s\S]*return;[\s\S]*chrome\.runtime\.sendMessage\(\{\s*type:\s*'SET_FREE_REUSABLE_PHONE'/
  );
});

test('sidepanel source wires runtime signup phone field to background sync messages', () => {
  assert.match(sidepanelSource, /function getRuntimeSignupPhoneValue\(state = latestState\)/);
  assert.match(sidepanelSource, /function shouldExecuteStep3WithSignupPhoneIdentity\(state = latestState\)/);
  assert.match(sidepanelSource, /function shouldPreserveSignupPhoneInputValue\(stateSignupPhone = ''\)/);
  assert.match(sidepanelSource, /function syncSignupPhoneInputFromState\(state = latestState\)/);
  assert.match(sidepanelSource, /async function persistSignupPhoneInputForAction\(\)/);
  assert.match(sidepanelSource, /type:\s*'SET_SIGNUP_PHONE_STATE'/);
  assert.match(sidepanelSource, /final \? 'SAVE_SIGNUP_PHONE' : 'SET_SIGNUP_PHONE_STATE'/);
  assert.match(sidepanelSource, /message\.payload\.signupPhoneNumber !== undefined/);
  assert.match(sidepanelSource, /await persistSignupPhoneInputForAction\(\);\s*await saveSettings/);
  assert.match(sidepanelSource, /if \(shouldExecuteStep3WithSignupPhoneIdentity\(latestState\)\)[\s\S]*payload: \{ step \}/);
  assert.match(sidepanelSource, /async function handleSkipStep\(step\)[\s\S]*await persistCurrentSettingsForAction\(\);/);
  assert.match(sidepanelSource, /inputSignupPhone\.addEventListener\('input'[\s\S]*signupPhoneInputDirty = true/);
});

test('sidepanel warns once before using phone signup with CPA source', async () => {
  assert.match(
    sidepanelSource,
    /signupMethodButtons\.forEach\(\(button\) => \{[\s\S]*await confirmCpaPhoneSignupIfNeeded\(\{[\s\S]*signupMethod: nextSignupMethod,[\s\S]*panelMode: getSelectedPanelMode\(\),/
  );
  assert.match(
    sidepanelSource,
    /selectPanelMode\.addEventListener\('change', async \(\) => \{[\s\S]*await confirmCpaPhoneSignupIfNeeded\(\{[\s\S]*signupMethod: getSelectedSignupMethod\(\),[\s\S]*panelMode: nextPanelMode,/
  );

  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('normalizePanelMode'),
    extractFunction('isPromptDismissed'),
    extractFunction('setPromptDismissed'),
    extractFunction('isCpaPhoneSignupPromptDismissed'),
    extractFunction('setCpaPhoneSignupPromptDismissed'),
    extractFunction('shouldWarnCpaPhoneSignup'),
    extractFunction('openCpaPhoneSignupWarningModal'),
    extractFunction('confirmCpaPhoneSignupIfNeeded'),
  ].join('\n');

  const api = new Function(`
const SIGNUP_METHOD_PHONE = 'phone';
const SIGNUP_METHOD_EMAIL = 'email';
const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;
const CPA_PHONE_SIGNUP_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-cpa-phone-signup-prompt-dismissed';
const CPA_PHONE_SIGNUP_WARNING_MESSAGE = 'CPA 未适配手机号注册模式，认证成功后无法使用。请使用 SUB2API，或者认证成功后重新登录一遍进行解决。';
const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};
let selectedSignupMethod = 'phone';
let selectedPanelMode = 'cpa';
let capturedOptions = null;
let modalResult = { confirmed: true, optionChecked: false };
function getSelectedSignupMethod() {
  return selectedSignupMethod;
}
function getSelectedPanelMode() {
  return selectedPanelMode;
}
async function openConfirmModalWithOption(options) {
  capturedOptions = options;
  return modalResult;
}
${bundle}
return {
  shouldWarnCpaPhoneSignup,
  confirmCpaPhoneSignupIfNeeded,
  getCapturedOptions() {
    return capturedOptions;
  },
  getDismissed() {
    return localStorage.getItem(CPA_PHONE_SIGNUP_PROMPT_DISMISSED_STORAGE_KEY);
  },
  setModalResult(result) {
    modalResult = result;
  },
};
`)();

  assert.equal(api.shouldWarnCpaPhoneSignup('phone', 'cpa'), true);
  assert.equal(api.shouldWarnCpaPhoneSignup('email', 'cpa'), false);
  assert.equal(api.shouldWarnCpaPhoneSignup('phone', 'sub2api'), false);
  assert.equal(api.shouldWarnCpaPhoneSignup('phone', 'codex2api'), false);

  const firstResult = await api.confirmCpaPhoneSignupIfNeeded({ signupMethod: 'phone', panelMode: 'cpa' });
  assert.equal(firstResult, true);
  assert.equal(api.getCapturedOptions().title, 'CPA 手机号注册提醒');
  assert.equal(api.getCapturedOptions().message, 'CPA 未适配手机号注册模式，认证成功后无法使用。请使用 SUB2API，或者认证成功后重新登录一遍进行解决。');
  assert.equal(api.getCapturedOptions().confirmLabel, '继续');
  assert.equal(api.getCapturedOptions().optionLabel, '不再提醒');
  assert.equal(api.getDismissed(), null);

  api.setModalResult({ confirmed: false, optionChecked: true });
  const secondResult = await api.confirmCpaPhoneSignupIfNeeded({ signupMethod: 'phone', panelMode: 'cpa' });
  assert.equal(secondResult, false);
  assert.equal(api.getDismissed(), '1');
  assert.equal(api.shouldWarnCpaPhoneSignup('phone', 'cpa'), false);
});

test('manual step 3 uses phone identity without requiring registration email', () => {
  const api = new Function(`
let latestState = { signupMethod: 'phone', phoneVerificationEnabled: true, signupPhoneNumber: '+441111111111', accountIdentifierType: 'phone', accountIdentifier: '+441111111111' };
const DEFAULT_SIGNUP_METHOD = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
function getSelectedSignupMethod() { return 'phone'; }
${extractFunction('normalizeSignupMethod')}
${extractFunction('getRuntimeSignupPhoneValue')}
${extractFunction('shouldExecuteStep3WithSignupPhoneIdentity')}
return { shouldExecuteStep3WithSignupPhoneIdentity };
`)();

  assert.equal(api.shouldExecuteStep3WithSignupPhoneIdentity({
    signupMethod: 'phone',
    phoneVerificationEnabled: true,
    accountIdentifierType: 'phone',
    accountIdentifier: '+441111111111',
    signupPhoneNumber: '+441111111111',
    email: '',
  }), true);
  assert.equal(api.shouldExecuteStep3WithSignupPhoneIdentity({
    signupMethod: 'email',
    accountIdentifierType: 'email',
    accountIdentifier: 'user@example.com',
    signupPhoneNumber: '',
    email: 'user@example.com',
  }), false);
});

test('runtime signup phone sync preserves active manual input until it is saved', () => {
  const api = new Function(`
let latestState = { signupMethod: 'phone', phoneVerificationEnabled: true, signupPhoneNumber: '+441111111111' };
let signupPhoneInputDirty = true;
let signupPhoneInputFocused = true;
const inputSignupPhone = { value: '+442222222222' };
const rowSignupPhone = { style: { display: 'none' } };
const inputPhoneVerificationEnabled = { checked: true };
const document = { activeElement: inputSignupPhone };
function getSelectedSignupMethod() { return 'phone'; }
${extractFunction('normalizeSignupMethod')}
${extractFunction('getRuntimeSignupPhoneValue')}
${extractFunction('getSignupPhoneInputValue')}
${extractFunction('shouldPreserveSignupPhoneInputValue')}
${extractFunction('syncSignupPhoneInputFromState')}
return {
  inputSignupPhone,
  rowSignupPhone,
  syncSignupPhoneInputFromState,
  getDirty: () => signupPhoneInputDirty,
  setFocused: (value) => { signupPhoneInputFocused = Boolean(value); document.activeElement = value ? inputSignupPhone : null; },
};
`)();

  api.syncSignupPhoneInputFromState({
    signupMethod: 'phone',
    phoneVerificationEnabled: true,
    signupPhoneNumber: '+441111111111',
  });
  assert.equal(api.inputSignupPhone.value, '+442222222222');
  assert.equal(api.rowSignupPhone.style.display, '');
  assert.equal(api.getDirty(), true);

  api.setFocused(false);
  api.syncSignupPhoneInputFromState({
    signupMethod: 'phone',
    phoneVerificationEnabled: true,
    signupPhoneNumber: '+441111111111',
  });
  assert.equal(api.inputSignupPhone.value, '+441111111111');
});

test('hero sms country helpers keep empty summary state and expose removable order handling', () => {
  assert.match(
    sidepanelSource,
    /function removeHeroSmsCountryFromOrder\(id\)/
  );
  assert.match(
    sidepanelSource,
    /displayHeroSmsCountryFallbackOrder\.textContent = '';/
  );

  const api = new Function(`
const HERO_SMS_COUNTRY_SELECTION_MAX = 3;
const btnHeroSmsCountryMenu = { textContent: '' };
function isFiveSimProviderSelected() { return false; }
function normalizeFiveSimCountryFallbackList(value = []) { return Array.isArray(value) ? value : []; }
function normalizeHeroSmsCountryFallbackList(value = []) { return Array.isArray(value) ? value : []; }
${extractFunction('updateHeroSmsCountryMenuSummary')}
return { btnHeroSmsCountryMenu, updateHeroSmsCountryMenuSummary };
`)();

  api.updateHeroSmsCountryMenuSummary([]);
  assert.equal(api.btnHeroSmsCountryMenu.textContent, '\u672a\u9009\u62e9 (0/3)');
});

test('live phone country sources are not hard-filtered down to the reduced country whitelist', () => {
  assert.doesNotMatch(
    sidepanelSource,
    /\.filter\(\(entry\) => entry\.id && FIVE_SIM_SUPPORTED_COUNTRY_ID_SET\.has\(String\(entry\.id\)\)\)/
  );
  assert.doesNotMatch(
    sidepanelSource,
    /\.filter\(\(item\) => HERO_SMS_SUPPORTED_COUNTRY_ID_SET\.has\(String\(Math\.floor\(Number\(item\?\.id\)\)\)\)/
  );
  assert.doesNotMatch(
    sidepanelSource,
    /\.filter\(\(entry\) => FIVE_SIM_SUPPORTED_COUNTRY_ID_SET\.has\(entry\.code \|\| entry\.id\)\)/
  );
});

test('removeHeroSmsCountryFromOrder clears the selected country and triggers a silent save', async () => {
  const api = new Function(`
let heroSmsCountrySelectionOrder = [52, 6];
const selectHeroSmsCountry = {
  options: [
    { value: '52', selected: true },
    { value: '6', selected: true },
  ],
};
const selectHeroSmsCountryFallback = {
  options: [
    { value: '52', selected: true },
    { value: '6', selected: true },
  ],
};
let dirtyValue = null;
let saveCount = 0;
let platformRefreshCount = 0;
function getSelectedPhoneSmsProvider() { return 'hero-sms'; }
function normalizePhoneSmsCountryId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  heroSmsCountrySelectionOrder = Array.from(selectHeroSmsCountry.options || [])
    .filter((option) => option.selected)
    .map((option) => Number(option.value));
  return heroSmsCountrySelectionOrder.map((id) => ({ id, label: 'Country #' + id }));
}
function updateHeroSmsPlatformDisplay() { platformRefreshCount += 1; }
function markSettingsDirty(value) { dirtyValue = value; }
function saveSettings() { saveCount += 1; return Promise.resolve(); }
${extractFunction('removeHeroSmsCountryFromOrder')}
return {
  removeHeroSmsCountryFromOrder,
  selectHeroSmsCountry,
  selectHeroSmsCountryFallback,
  getHeroSmsCountrySelectionOrder: () => [...heroSmsCountrySelectionOrder],
  getDirtyValue: () => dirtyValue,
  getSaveCount: () => saveCount,
  getPlatformRefreshCount: () => platformRefreshCount,
};
`)();

  const nextOrder = api.removeHeroSmsCountryFromOrder(52);
  await Promise.resolve();

  assert.deepStrictEqual(nextOrder, [{ id: 6, label: 'Country #6' }]);
  assert.deepStrictEqual(api.getHeroSmsCountrySelectionOrder(), [6]);
  assert.equal(api.selectHeroSmsCountry.options[0].selected, false);
  assert.equal(api.selectHeroSmsCountry.options[1].selected, true);
  assert.equal(api.selectHeroSmsCountryFallback.options[0].selected, false);
  assert.equal(api.selectHeroSmsCountryFallback.options[1].selected, true);
  assert.equal(api.getDirtyValue(), true);
  assert.equal(api.getSaveCount(), 1);
  assert.equal(api.getPlatformRefreshCount(), 1);
});

test('updatePhoneVerificationSettingsUI toggles SMS rows from the sms switch and provider selection', () => {
  const api = new Function(`
let phoneVerificationSectionExpanded = false;
let latestState = {};
const inputPhoneVerificationEnabled = { checked: false };
const rowPhoneVerificationEnabled = { style: { display: 'none' } };
const rowPhoneVerificationFold = { style: { display: 'none' } };
const rowSignupMethod = { style: { display: 'none' } };
const rowSignupPhone = { style: { display: 'none' } };
const rowPhoneSmsProvider = { style: { display: 'none' } };
const rowPhoneSmsProviderOrder = { style: { display: 'none' } };
const rowPhoneSmsProviderOrderActions = { style: { display: 'none' } };
const selectPhoneSmsProvider = { value: 'hero-sms' };
const btnTogglePhoneVerificationSection = {
  disabled: false,
  textContent: '',
  title: '',
  setAttribute: () => {},
};
  const DEFAULT_PHONE_SMS_PROVIDER_ORDER = ['hero-sms', '5sim', 'nexsms'];
  const phoneSmsProviderOrderSelection = [];
  function normalizePhoneSmsProviderOrderValue(value = [], fallbackOrder = DEFAULT_PHONE_SMS_PROVIDER_ORDER) {
    const source = Array.isArray(value) ? value : [];
    const normalized = [...source];
    if (normalized.length) {
      return normalized.slice(0, 3);
    }
    if (!Array.isArray(fallbackOrder) || !fallbackOrder.length) {
      return [];
    }
    const fallbackNormalized = [];
    for (const provider of fallbackOrder) {
      if (!fallbackNormalized.includes(provider)) {
        fallbackNormalized.push(provider);
      }
    }
    return fallbackNormalized.slice(0, 3);
  }
  function resolveNormalizedProviderOrderForRuntime(state = {}) {
    const rawOrder = Array.isArray(state?.phoneSmsProviderOrder) ? state.phoneSmsProviderOrder : [];
    const normalizedOrder = normalizePhoneSmsProviderOrderValue(rawOrder, []);
    if (normalizedOrder.length) {
      return normalizedOrder;
    }
    const fallbackProvider = String(state?.phoneSmsProvider || selectPhoneSmsProvider?.value || 'hero-sms').trim().toLowerCase() || 'hero-sms';
    return [fallbackProvider];
  }
function updatePhoneSmsProviderOrderSummary() {}
const rowHeroSmsPlatform = { style: { display: 'none' } };
const rowHeroSmsCountry = { style: { display: 'none' } };
const rowHeroSmsCountryFallback = { style: { display: 'none' } };
const rowHeroSmsAcquirePriority = { style: { display: 'none' } };
const rowHeroSmsApiKey = { style: { display: 'none' } };
const rowHeroSmsMaxPrice = { style: { display: 'none' } };
const rowFiveSimApiKey = { style: { display: 'none' } };
const rowFiveSimCountry = { style: { display: 'none' } };
const rowFiveSimCountryFallback = { style: { display: 'none' } };
const rowFiveSimOperator = { style: { display: 'none' } };
const rowFiveSimProduct = { style: { display: 'none' } };
const rowNexSmsApiKey = { style: { display: 'none' } };
const rowNexSmsCountry = { style: { display: 'none' } };
const rowNexSmsCountryFallback = { style: { display: 'none' } };
const rowNexSmsServiceCode = { style: { display: 'none' } };
const rowHeroSmsRuntimePair = { style: { display: 'none' } };
const rowHeroSmsCurrentNumber = { style: { display: 'none' } };
const rowHeroSmsCurrentCountdown = { style: { display: 'none' } };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const rowHeroSmsCurrentCode = { style: { display: 'none' } };
const rowHeroSmsPreferredActivation = { style: { display: 'none' } };
const rowPhoneVerificationResendCount = { style: { display: 'none' } };
const rowPhoneReplacementLimit = { style: { display: 'none' } };
const rowPhoneCodeWaitSeconds = { style: { display: 'none' } };
const rowPhoneCodeTimeoutWindows = { style: { display: 'none' } };
const rowPhoneCodePollIntervalSeconds = { style: { display: 'none' } };
const rowPhoneCodePollMaxRounds = { style: { display: 'none' } };
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
function getSelectedPhoneSmsProvider() { return selectPhoneSmsProvider.value; }
function isFiveSimProviderSelected() { return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM; }
function updateHeroSmsPlatformDisplay() {}
function updateSignupMethodUI() {
  rowSignupMethod.style.display = inputPhoneVerificationEnabled.checked ? '' : 'none';
}
function syncSignupPhoneInputFromState() {
  rowSignupPhone.style.display = inputPhoneVerificationEnabled.checked && latestState.signupPhoneNumber ? '' : 'none';
}
function setFreePhoneReuseControlsLocked() {}
function isAutoRunLockedPhase() { return false; }
function isAutoRunScheduledPhase() { return false; }

${extractFunction('updatePhoneVerificationSettingsUI')}

return {
  setExpanded(value) { phoneVerificationSectionExpanded = Boolean(value); },
  setLatestState: (state) => { latestState = state || {}; },
  rowPhoneVerificationEnabled,
  rowPhoneVerificationFold,
  rowSignupMethod,
  rowSignupPhone,
  rowPhoneSmsProvider,
  rowPhoneSmsProviderOrder,
  rowPhoneSmsProviderOrderActions,
  selectPhoneSmsProvider,
  btnTogglePhoneVerificationSection,
  inputPhoneVerificationEnabled,
  rowHeroSmsPlatform,
  rowHeroSmsCountry,
  rowHeroSmsCountryFallback,
  rowHeroSmsAcquirePriority,
  rowHeroSmsApiKey,
  rowHeroSmsMaxPrice,
  rowFiveSimApiKey,
  rowFiveSimCountry,
  rowFiveSimCountryFallback,
  rowFiveSimOperator,
  rowFiveSimProduct,
  rowNexSmsApiKey,
  rowNexSmsCountry,
  rowNexSmsCountryFallback,
  rowNexSmsServiceCode,
  rowHeroSmsRuntimePair,
  rowHeroSmsCurrentNumber,
  rowHeroSmsCurrentCountdown,
  rowHeroSmsPriceTiers,
  rowHeroSmsCurrentCode,
  rowHeroSmsPreferredActivation,
  rowPhoneVerificationResendCount,
  rowPhoneReplacementLimit,
  rowPhoneCodeWaitSeconds,
  rowPhoneCodeTimeoutWindows,
  rowPhoneCodePollIntervalSeconds,
  rowPhoneCodePollMaxRounds,
  setSelectedPhoneSmsProvider(value) { selectPhoneSmsProvider.value = value; },
  updatePhoneVerificationSettingsUI,
};
`)();

  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationEnabled.style.display, '');
  assert.equal(api.rowPhoneVerificationFold.style.display, 'none');
  assert.equal(api.rowSignupMethod.style.display, 'none');
  assert.equal(api.rowSignupPhone.style.display, 'none');
  assert.equal(api.rowPhoneSmsProvider.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, 'none');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, true);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '展开设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsRuntimePair.style.display, 'none');
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCountdown.style.display, 'none');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, 'none');
  assert.equal(api.rowHeroSmsPreferredActivation.style.display, 'none');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, 'none');
  assert.equal(api.rowPhoneReplacementLimit.style.display, 'none');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, 'none');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimCountry.style.display, 'none');
  assert.equal(api.rowFiveSimCountryFallback.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowFiveSimProduct.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsCountry.style.display, 'none');
  assert.equal(api.rowNexSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowNexSmsServiceCode.style.display, 'none');

  api.inputPhoneVerificationEnabled.checked = true;
  api.setLatestState({ signupPhoneNumber: '66959916439' });
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationFold.style.display, 'none');
  assert.equal(api.rowSignupMethod.style.display, '');
  assert.equal(api.rowSignupPhone.style.display, '');
  assert.equal(api.rowPhoneSmsProvider.style.display, 'none');
  assert.equal(api.rowHeroSmsRuntimePair.style.display, '');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, '');
  assert.equal(api.rowHeroSmsCurrentCountdown.style.display, '');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, '');
  assert.equal(api.rowHeroSmsPreferredActivation.style.display, '');

  api.setExpanded(true);
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationFold.style.display, '');
  assert.equal(api.rowSignupMethod.style.display, '');
  assert.equal(api.rowPhoneSmsProvider.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, '');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, false);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '收起设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, '');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, '');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, '');
  assert.equal(api.rowHeroSmsApiKey.style.display, '');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, '');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, '');
  assert.equal(api.rowHeroSmsCurrentCountdown.style.display, '');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, '');
  assert.equal(api.rowHeroSmsPreferredActivation.style.display, '');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, '');
  assert.equal(api.rowPhoneReplacementLimit.style.display, '');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, '');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, '');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, '');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, '');

  api.setSelectedPhoneSmsProvider('5sim');
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowFiveSimApiKey.style.display, '');
  assert.equal(api.rowFiveSimCountry.style.display, '');
  assert.equal(api.rowFiveSimCountryFallback.style.display, '');
  assert.equal(api.rowFiveSimOperator.style.display, '');
  assert.equal(api.rowFiveSimProduct.style.display, '');

  api.setSelectedPhoneSmsProvider('nexsms');
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowNexSmsApiKey.style.display, '');
  assert.equal(api.rowNexSmsCountry.style.display, '');
  assert.equal(api.rowNexSmsCountryFallback.style.display, '');
  assert.equal(api.rowNexSmsServiceCode.style.display, '');
});

test('collectSettingsPayload keeps local helper sync enabled while persisting sms toggle state', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
const window = {};
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
  fiveSimCountryOrder: ['thailand', 'england'],
};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: '' };
const selectTempEmailDomain = { value: '' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const inputSub2ApiDefaultProxy = { value: '' };
const inputCodex2ApiUrl = { value: '' };
const inputCodex2ApiAdminKey = { value: '' };
const inputPassword = { value: '' };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: false };
const selectIcloudHostPreference = { value: 'auto' };
const inputMail2925UseAccountPool = { checked: false };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputHotmailRemoteBaseUrl = { value: '' };
const inputHotmailLocalBaseUrl = { value: '' };
const inputLuckmailApiKey = { value: '' };
const inputLuckmailBaseUrl = { value: '' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: '' };
const inputTempEmailBaseUrl = { value: '' };
const inputTempEmailAdminAuth = { value: '' };
const inputTempEmailCustomAuth = { value: '' };
const inputTempEmailReceiveMailbox = { value: '' };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '0' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '' };
const inputPhoneVerificationEnabled = { checked: true };
const inputFreePhoneReuseEnabled = { checked: true };
const inputFreePhoneReuseAutoEnabled = { checked: true };
const selectPhoneSmsProvider = { value: 'hero-sms' };
const inputVerificationResendCount = { value: '4' };
const inputHeroSmsApiKey = { value: 'demo-key' };
const inputFiveSimApiKey = { value: 'five-sim-key' };
const inputFiveSimOperator = { value: 'any' };
const inputFiveSimProduct = { value: 'openai' };
const inputNexSmsApiKey = { value: 'nex-key' };
const inputNexSmsServiceCode = { value: 'ot' };
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'price' };
function getSelectedPhonePreferredActivation() {
  return {
    provider: 'hero-sms',
    activationId: 'demo-activation',
    phoneNumber: '66958889999',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  };
}
const inputHeroSmsMaxPrice = { value: '0.12' };
const inputHeroSmsPreferredPrice = { value: '0.0512' };
const inputPhoneReplacementLimit = { value: '5' };
const inputPhoneCodeWaitSeconds = { value: '75' };
const inputPhoneCodeTimeoutWindows = { value: '3' };
const inputPhoneCodePollIntervalSeconds = { value: '6' };
const inputPhoneCodePollMaxRounds = { value: '18' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_PHONE_CODE_POLL_MAX_ROUNDS = 4;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const PHONE_CODE_POLL_MAX_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_MAX_ROUNDS_MAX = 120;
const DEFAULT_HERO_SMS_REUSE_ENABLED = true;
const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
const DEFAULT_HERO_SMS_ACQUIRE_PRIORITY = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO_SMS;
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_FIVE_SIM_PRODUCT = 'openai';
const DEFAULT_NEX_SMS_COUNTRY_ORDER = [1];
const DEFAULT_NEX_SMS_SERVICE_CODE = 'ot';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const selectHeroSmsCountry = {
  value: '52',
  selectedIndex: 0,
  options: [{ textContent: 'Thailand' }],
};
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedPlusPaymentMethod() { return 'paypal'; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedHotmailServiceMode() { return 'local'; }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim() || 'ms_graph'; }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number(value) || fallback; }
${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizeFiveSimCountryCode')}
${extractFunction('normalizeFiveSimCountryOrderValue')}
${extractFunction('normalizeFiveSimProductValue')}
${extractFunction('normalizeNexSmsCountryIdValue')}
${extractFunction('normalizeNexSmsCountryOrderValue')}
${extractFunction('normalizeNexSmsServiceCodeValue')}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProvider(selectPhoneSmsProvider?.value || latestState?.phoneSmsProvider); }
function getSelectedPhoneSmsProviderOrder() { return ['nexsms', '5sim']; }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeFiveSimCountryFallbackList')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizePhoneVerificationReplacementLimit')}
${extractFunction('normalizePhoneCodeWaitSecondsValue')}
${extractFunction('normalizePhoneCodeTimeoutWindowsValue')}
${extractFunction('normalizePhoneCodePollIntervalSecondsValue')}
${extractFunction('normalizePhoneCodePollMaxRoundsValue')}
${extractFunction('normalizeHeroSmsReuseEnabledValue')}
${extractFunction('normalizeHeroSmsAcquirePriority')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('getSelectedHeroSmsCountryOption')}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 52, label: 'Thailand' }, { id: 16, label: 'United Kingdom' }];
}
function getSelectedSignupMethod() { return 'phone'; }
${extractFunction('normalizePanelMode')}
${extractFunction('getSelectedPanelMode')}
function getSelectedFiveSimCountries() {
  return [{ id: 'thailand', code: 'thailand', label: 'Thailand' }, { id: 'vietnam', code: 'vietnam', label: 'Vietnam' }];
}
function getSelectedNexSmsCountries() {
  return [{ id: 1, label: 'Country #1' }];
}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.phoneVerificationEnabled, true);
  assert.equal(payload.signupMethod, 'phone');
  assert.equal(payload.phoneSmsProvider, 'hero-sms');
  assert.deepStrictEqual(payload.phoneSmsProviderOrder, ['nexsms', '5sim']);
  assert.equal(payload.accountRunHistoryTextEnabled, true);
  assert.equal(payload.accountRunHistoryHelperBaseUrl, 'http://127.0.0.1:17373');
  assert.equal(payload.heroSmsApiKey, 'demo-key');
  assert.equal(payload.fiveSimApiKey, 'five-sim-key');
  assert.deepStrictEqual(payload.fiveSimCountryOrder, ['thailand', 'vietnam']);
  assert.equal(payload.fiveSimOperator, 'any');
  assert.equal(payload.fiveSimProduct, 'openai');
  assert.equal(payload.nexSmsApiKey, 'nex-key');
  assert.deepStrictEqual(payload.nexSmsCountryOrder, [1]);
  assert.equal(payload.nexSmsServiceCode, 'ot');
  assert.equal(payload.heroSmsReuseEnabled, true);
  assert.equal(payload.freePhoneReuseEnabled, true);
  assert.equal(payload.freePhoneReuseAutoEnabled, true);
  assert.equal(payload.heroSmsAcquirePriority, 'price');
  assert.equal(payload.heroSmsMaxPrice, '0.12');
  assert.equal(payload.heroSmsPreferredPrice, '0.0512');
  assert.deepStrictEqual(payload.phonePreferredActivation, {
    provider: 'hero-sms',
    activationId: 'demo-activation',
    phoneNumber: '66958889999',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(payload.phoneVerificationReplacementLimit, 5);
  assert.equal(payload.phoneCodeWaitSeconds, 75);
  assert.equal(payload.phoneCodeTimeoutWindows, 3);
  assert.equal(payload.phoneCodePollIntervalSeconds, 6);
  assert.equal(payload.phoneCodePollMaxRounds, 18);
  assert.equal(payload.heroSmsCountryId, 52);
  assert.equal(payload.heroSmsCountryLabel, 'Thailand');
  assert.deepStrictEqual(payload.heroSmsCountryFallback, [{ id: 16, label: 'United Kingdom' }]);
  assert.equal(payload.fiveSimApiKey, 'five-sim-key');
  assert.equal(payload.fiveSimCountryId, 'vietnam');
});

test('switchPhoneSmsProvider saves API keys independently when the select value has already changed', async () => {
  const api = new Function(`
let latestState = {
  phoneSmsProvider: 'hero-sms',
  heroSmsApiKey: 'hero-old',
  fiveSimApiKey: 'five-old',
  heroSmsMaxPrice: '0.11',
  fiveSimMaxPrice: '12',
  heroSmsCountryId: 52,
  heroSmsCountryLabel: 'Thailand',
  heroSmsCountryFallback: [],
  fiveSimCountryId: 'vietnam',
  fiveSimCountryLabel: '越南 (Vietnam)',
  fiveSimCountryFallback: [],
  fiveSimOperator: 'any',
};
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const selectPhoneSmsProvider = { value: 'hero-sms', dataset: { activeProvider: 'hero-sms' } };
const inputHeroSmsApiKey = { value: 'hero-live' };
const inputHeroSmsMaxPrice = { value: '0.22' };
const inputFiveSimOperator = { value: 'any' };
const displayHeroSmsPriceTiers = { textContent: '' };
const displayPhoneSmsBalance = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: '' } };
let heroSmsCountrySelectionOrder = [];
let savedPayload = null;

${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('setPhoneSmsProviderSelectValue')}
${extractFunction('getLastAppliedPhoneSmsProvider')}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProvider(selectPhoneSmsProvider?.value || latestState?.phoneSmsProvider); }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('normalizeHeroSmsCountryFallbackList')}
${extractFunction('normalizeFiveSimCountryFallbackList')}
function getSelectedHeroSmsCountryOption() {
  return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM
    ? { id: latestState.fiveSimCountryId || DEFAULT_FIVE_SIM_COUNTRY_ID, label: latestState.fiveSimCountryLabel || DEFAULT_FIVE_SIM_COUNTRY_LABEL }
    : { id: latestState.heroSmsCountryId || DEFAULT_HERO_SMS_COUNTRY_ID, label: latestState.heroSmsCountryLabel || DEFAULT_HERO_SMS_COUNTRY_LABEL };
}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM
    ? [{ id: 'vietnam', label: '越南 (Vietnam)' }]
    : [{ id: 52, label: 'Thailand' }];
}
function syncLatestState(patch) { latestState = { ...latestState, ...patch }; }
function loadHeroSmsCountries() { return Promise.resolve(); }
function applyHeroSmsFallbackSelection() {}
function updatePhoneVerificationSettingsUI() {}
function markSettingsDirty() {}
function saveSettings() { savedPayload = { ...latestState }; return Promise.resolve(); }

${extractFunction('switchPhoneSmsProvider')}

return {
  selectPhoneSmsProvider,
  inputHeroSmsApiKey,
  get latestState() { return latestState; },
  get savedPayload() { return savedPayload; },
  switchPhoneSmsProvider,
};
`)();

  // Browser change events update <select>.value before the listener runs.
  api.selectPhoneSmsProvider.value = '5sim';
  await api.switchPhoneSmsProvider(api.selectPhoneSmsProvider.value);

  assert.equal(api.latestState.phoneSmsProvider, '5sim');
  assert.equal(api.latestState.heroSmsApiKey, 'hero-live');
  assert.equal(api.latestState.fiveSimApiKey, 'five-old');
  assert.equal(api.inputHeroSmsApiKey.value, 'five-old');
  assert.equal(api.selectPhoneSmsProvider.dataset.activeProvider, '5sim');

  api.inputHeroSmsApiKey.value = 'five-live';
  api.selectPhoneSmsProvider.value = 'hero-sms';
  await api.switchPhoneSmsProvider(api.selectPhoneSmsProvider.value);

  assert.equal(api.latestState.phoneSmsProvider, 'hero-sms');
  assert.equal(api.latestState.heroSmsApiKey, 'hero-live');
  assert.equal(api.latestState.fiveSimApiKey, 'five-live');
  assert.equal(api.inputHeroSmsApiKey.value, 'hero-live');
  assert.equal(api.selectPhoneSmsProvider.dataset.activeProvider, 'hero-sms');
  assert.equal(api.savedPayload.heroSmsApiKey, 'hero-live');
  assert.equal(api.savedPayload.fiveSimApiKey, 'five-live');
});

test('formatPhoneSmsPriceEntriesSummary treats HeroSMS physicalCount=0 as out of stock even when count is positive', () => {
  const api = new Function(`
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatPhoneSmsPriceEntriesSummary')}
return { formatPhoneSmsPriceEntriesSummary };
`)();

  const summary = api.formatPhoneSmsPriceEntriesSummary({
    52: {
      dr: {
        cost: 0.05,
        count: 3,
        physicalCount: 0,
      },
    },
  });

  assert.deepStrictEqual(summary.inStockPrices, []);
  assert.deepStrictEqual(summary.allPrices, [0.05]);
  assert.equal(summary.entries[0].inStock, false);
  assert.equal(summary.entries[0].stockCount, 0);
});

test('previewHeroSmsPriceTiers prefers 5sim products price for buy-compatible any operator', async () => {
  const api = new Function(`
let latestState = { phoneSmsProvider: '5sim', fiveSimOperator: 'any' };
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_FIVE_SIM_PRODUCT = 'openai';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const inputHeroSmsMaxPrice = { value: '' };
const inputHeroSmsApiKey = { value: '' };
const inputFiveSimOperator = { value: 'any' };
const inputFiveSimProduct = { value: 'openai' };
const displayHeroSmsPriceTiers = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const fetchCalls = [];

${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
const phoneSmsProviderOrderSelection = [];
function getSelectedPhoneSmsProvider() { return '5sim'; }
function getSelectedPhoneSmsProviderOrder() { return ['5sim']; }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimCountryCode')}
${extractFunction('normalizeFiveSimProductValue')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('isHeroSmsPreviewEmptyPayload')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatPhoneSmsPriceEntriesSummary')}
${extractFunction('describeHeroSmsPreviewPayload')}
${extractFunction('summarizeHeroSmsPreviewError')}
${extractFunction('formatPriceTiersForPreview')}
${extractFunction('formatPriceTiersWithZeroStockForPreview')}
function normalizeHeroSmsFetchErrorMessage(error) { return error?.message || String(error); }
function getFiveSimCountryLabelByCode() { return '越南 (Vietnam)'; }
function getSelectedFiveSimCountries() {
  return [{ id: 'vietnam', code: 'vietnam', label: '越南 (Vietnam)' }];
}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 'vietnam', label: '越南 (Vietnam)' }];
}
function getSelectedHeroSmsCountryOption() {
  return { id: 'vietnam', label: '越南 (Vietnam)' };
}
function normalizePhoneSmsCountryId(value) { return normalizeFiveSimCountryId(value); }
function normalizePhoneSmsCountryLabel(value) { return normalizeFiveSimCountryLabel(value); }
function getHeroSmsCountryLabelById() { return '越南 (Vietnam)'; }
async function fetch(url, options = {}) {
  const parsed = new URL(url);
  fetchCalls.push({ url: parsed, options });
  if (parsed.pathname === '/v1/guest/products/vietnam/any') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ openai: { Category: 'activation', Qty: 4609, Price: 0.08 } }),
    };
  }
  if (parsed.pathname === '/v1/guest/prices') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        vietnam: {
          openai: {
            virtual21: { cost: 0.0769, count: 0 },
            virtual47: { cost: 0.1282, count: 4608 },
          },
        },
      }),
    };
  }
  throw new Error('unexpected ' + parsed.pathname);
}

${extractFunction('buildFiveSimPricePreviewLines')}
${extractFunction('previewHeroSmsPriceTiers')}

return {
  displayHeroSmsPriceTiers,
  rowHeroSmsPriceTiers,
  fetchCalls,
  previewHeroSmsPriceTiers,
};
`)();

  await api.previewHeroSmsPriceTiers();

  assert.equal(
    api.displayHeroSmsPriceTiers.textContent,
    '5sim:\n越南 (Vietnam): 最低 0.1282；档位：0.0769(x0), 0.1282(x4608)'
  );
  assert.equal(api.rowHeroSmsPriceTiers.style.display, '');
  assert.deepStrictEqual(
    api.fetchCalls.map((entry) => entry.url.pathname),
    ['/v1/guest/prices']
  );
});

test('sidepanel html exposes SMSBower service lookup controls', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="btn-sms-bower-service-lookup"/);
  assert.match(html, /id="display-sms-bower-service-lookup"/);
});

test('loadSmsBowerCountries fetches SMSBower countries with the SMSBower API key', async () => {
  const api = new Function('assert', 'createTestSelect', 'createTestDocument', `
const providerCalls = [];
let fetchCountriesState = null;
let appliedCountries = null;
const fakeProvider = {
  fetchCountries: async (state) => {
    fetchCountriesState = state;
    return {
      7: { id: 7, eng: 'Kazakhstan', chn: '哈萨克斯坦' },
      1: { id: 1, eng: 'United States', chn: '美国' },
    };
  },
};
const window = {
  PhoneSmsProviderRegistry: {
    createProvider(providerId, deps) {
      providerCalls.push({ source: 'registry', providerId, deps });
      return fakeProvider;
    },
  },
  PhoneSmsBowerProvider: {
    createProvider(deps) {
      providerCalls.push({ source: 'module', deps });
      return fakeProvider;
    },
  },
};
const document = createTestDocument();
const inputSmsBowerApiKey = { value: 'demo-key' };
const inputSmsBowerServiceCode = { value: 'zztest_service' };
const inputHeroSmsMaxPrice = { value: '0.25' };
const selectSmsBowerCountry = createTestSelect([{ value: '1', label: 'Country #1', selected: true }]);
let smsBowerCountrySelectionOrder = [];
const smsBowerCountrySearchTextById = new Map();
const SMS_BOWER_FALLBACK_COUNTRY_ITEMS = Object.freeze([{ id: 0, label: 'Country #0' }]);
const HERO_SMS_COUNTRY_SELECTION_MAX = 3;
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
let latestState = { smsBowerCountryOrder: [7, 1], smsBowerServiceCode: 'zztest_service', smsBowerMaxPrice: '0.25' };
async function fetch() { throw new Error('unexpected global fetch'); }
function applySmsBowerCountrySelection(countries = [], options = {}) {
  appliedCountries = { countries, options };
  const selectedIds = countries.map((entry) => Number(entry?.id ?? entry)).filter(Number.isFinite);
  const selectedSet = new Set(selectedIds);
  Array.from(selectSmsBowerCountry.options || []).forEach((option) => {
    option.selected = selectedSet.has(Number(option.value));
  });
  smsBowerCountrySelectionOrder = selectedIds;
  return selectedIds.map((id) => ({ id, label: String(selectSmsBowerCountry.options.find((option) => Number(option.value) === id)?.textContent || '') }));
}
${extractFunction('normalizeSmsBowerCountryIdValue')}
${extractFunction('normalizeSmsBowerCountryOrderValue')}
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractFunction('normalizeSmsBowerCountryLabel')}
${extractFunction('normalizeSmsBowerCountryFallbackList')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractOptionalFunction('normalizeSmsBowerCountryCatalog')}
${extractFunction('loadSmsBowerCountries')}
return {
  selectSmsBowerCountry,
  smsBowerCountrySearchTextById,
  providerCalls,
  get fetchCountriesState() { return fetchCountriesState; },
  get appliedCountries() { return appliedCountries; },
  loadSmsBowerCountries,
};
`)(assert, createTestSelect, createTestDocument);

  await api.loadSmsBowerCountries();

  assert.equal(api.providerCalls.length, 1);
  assert.equal(api.fetchCountriesState.smsBowerApiKey, 'demo-key');
  assert.equal(api.fetchCountriesState.smsBowerServiceCode, 'zztest_service');
  assert.equal(api.fetchCountriesState.smsBowerMaxPrice, '0.25');
  assert.deepStrictEqual(api.selectSmsBowerCountry.options.map((option) => option.value), ['7', '1']);
  assert.match(api.selectSmsBowerCountry.options[0].textContent, /Kazakhstan/);
  assert.match(api.selectSmsBowerCountry.options[1].textContent, /United States/);
  assert.deepStrictEqual(api.appliedCountries.countries, [7, 1]);
  assert.equal(api.appliedCountries.options.ensureDefault, false);
  assert.match(api.smsBowerCountrySearchTextById.get(7), /Kazakhstan/);
});

test('loadSmsBowerCountries clears placeholder and prompts when SMSBower API key is missing', async () => {
  const api = new Function('createTestSelect', 'createTestDocument', `
let providerCalled = false;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider() {
      providerCalled = true;
      throw new Error('provider should not be created without key');
    },
  },
};
const document = createTestDocument();
const inputSmsBowerApiKey = { value: '' };
const inputSmsBowerServiceCode = { value: '' };
const inputHeroSmsMaxPrice = { value: '' };
const selectSmsBowerCountry = createTestSelect([{ value: '1', label: 'Country #1', selected: true }]);
let smsBowerCountrySelectionOrder = [1];
const smsBowerCountrySearchTextById = new Map();
const displaySmsBowerCountryFallbackOrder = { textContent: '' };
const SMS_BOWER_FALLBACK_COUNTRY_ITEMS = Object.freeze([{ id: 0, label: 'Country #0' }]);
const HERO_SMS_COUNTRY_SELECTION_MAX = 3;
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
let latestState = { smsBowerCountryOrder: [] };
function applySmsBowerCountrySelection(countries = [], options = {}) { return countries; }
${extractFunction('normalizeSmsBowerCountryIdValue')}
${extractFunction('normalizeSmsBowerCountryOrderValue')}
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractFunction('normalizeSmsBowerCountryLabel')}
${extractFunction('normalizeSmsBowerCountryFallbackList')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractOptionalFunction('normalizeSmsBowerCountryCatalog')}
${extractFunction('loadSmsBowerCountries')}
return {
  selectSmsBowerCountry,
  smsBowerCountrySearchTextById,
  displaySmsBowerCountryFallbackOrder,
  get providerCalled() { return providerCalled; },
  loadSmsBowerCountries,
};
`)(createTestSelect, createTestDocument);

  await api.loadSmsBowerCountries();

  assert.equal(api.providerCalled, false);
  assert.deepStrictEqual(api.selectSmsBowerCountry.options.map((option) => option.value), []);
  assert.equal(api.smsBowerCountrySearchTextById.size, 0);
  assert.match(api.displaySmsBowerCountryFallbackOrder.textContent, /SMSBower API Key/);
});

test('lookupSmsBowerServicesList fetches and filters SMSBower services without hardcoded OpenAI code', async () => {
  const api = new Function('createTestSelect', `
let fetchServicesState = null;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider(providerId) {
      return {
        fetchServicesList: async (state) => {
          fetchServicesState = { providerId, state };
          return {
            status: 'success',
            services: [
              { code: 'zztest_service', name: 'ZZ Test Service' },
              { code: 'other_service', name: 'Other Service' },
            ],
          };
        },
      };
    },
  },
};
const inputSmsBowerApiKey = { value: 'demo-key' };
const inputSmsBowerServiceCode = { value: 'zztest' };
const inputHeroSmsMaxPrice = { value: '' };
const displaySmsBowerServiceLookup = { textContent: '' };
const selectSmsBowerCountry = createTestSelect([{ value: '7', label: 'Kazakhstan', selected: true }]);
let smsBowerCountrySelectionOrder = [7];
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
const HERO_SMS_COUNTRY_SELECTION_MAX = 3;
let latestState = { smsBowerCountryOrder: [7], smsBowerServiceCode: '' };
function getSelectedSmsBowerCountries() { return [{ id: 7, label: 'Kazakhstan' }]; }
${extractFunction('normalizeSmsBowerCountryIdValue')}
${extractFunction('normalizeSmsBowerCountryOrderValue')}
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractOptionalFunction('normalizeSmsBowerServicesCatalog')}
${extractFunction('lookupSmsBowerServicesList')}
return {
  displaySmsBowerServiceLookup,
  get fetchServicesState() { return fetchServicesState; },
  lookupSmsBowerServicesList,
};
`)(createTestSelect);

  await api.lookupSmsBowerServicesList();

  assert.equal(api.fetchServicesState.providerId, 'smsbower');
  assert.equal(api.fetchServicesState.state.smsBowerApiKey, 'demo-key');
  assert.match(api.displaySmsBowerServiceLookup.textContent, /zztest_service/);
  assert.match(api.displaySmsBowerServiceLookup.textContent, /ZZ Test Service/);
  assert.doesNotMatch(api.displaySmsBowerServiceLookup.textContent, /openai/i);
});

test('lookupSmsBowerServicesList requires the SMSBower API key before fetching', async () => {
  const api = new Function(`
let providerCalled = false;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider() {
      providerCalled = true;
      return { fetchServicesList: async () => ({ services: [] }) };
    },
  },
};
const inputSmsBowerApiKey = { value: '' };
const inputSmsBowerServiceCode = { value: 'zztest' };
const inputHeroSmsMaxPrice = { value: '' };
const displaySmsBowerServiceLookup = { textContent: '' };
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
let latestState = {};
function getSelectedSmsBowerCountries() { return []; }
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractOptionalFunction('normalizeSmsBowerServicesCatalog')}
${extractFunction('lookupSmsBowerServicesList')}
return {
  displaySmsBowerServiceLookup,
  get providerCalled() { return providerCalled; },
  lookupSmsBowerServicesList,
};
`)();

  await api.lookupSmsBowerServicesList();

  assert.equal(api.providerCalled, false);
  assert.match(api.displaySmsBowerServiceLookup.textContent, /SMSBower API Key/);
});

test('previewHeroSmsPriceTiers queries SMSBower prices with SMSBower settings only', async () => {
  const api = new Function('createTestSelect', `
let priceState = null;
let priceCountryConfig = null;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider(providerId) {
      return {
        fetchPrices: async (state, countryConfig) => {
          priceState = { providerId, state };
          priceCountryConfig = countryConfig;
          return {
            7: {
              zztest_service: {
                virtual1: { cost: 0.1234, count: 3 },
              },
            },
          };
        },
      };
    },
  },
};
let latestState = { phoneSmsProvider: 'smsbower', smsBowerCountryOrder: [7], smsBowerServiceCode: 'zztest_service' };
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_PHONE_SMS_PROVIDER = 'hero-sms';
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_FIVE_SIM_PRODUCT = 'openai';
const HERO_SMS_COUNTRY_SELECTION_MAX = 3;
const inputHeroSmsMaxPrice = { value: '0.50' };
const inputHeroSmsApiKey = { value: 'hero-key' };
const inputSmsBowerApiKey = { value: 'demo-key' };
const inputSmsBowerServiceCode = { value: 'zztest_service' };
const displayHeroSmsPriceTiers = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const phoneSmsProviderOrderSelection = [];
const selectSmsBowerCountry = createTestSelect([{ value: '7', label: 'Kazakhstan', selected: true }]);
let smsBowerCountrySelectionOrder = [7];
function getSelectedPhoneSmsProvider() { return 'smsbower'; }
function getSelectedPhoneSmsProviderOrder() { return ['smsbower']; }
function getSelectedSmsBowerCountries() { return [{ id: 7, label: 'Kazakhstan' }]; }
async function fetch(url) { throw new Error('unexpected HeroSMS fetch ' + url); }
${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('normalizePhoneSmsProviderValue')}
${extractFunction('normalizePhoneSmsProviderOrderValue')}
${extractFunction('normalizeSmsBowerCountryIdValue')}
${extractFunction('normalizeSmsBowerCountryOrderValue')}
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractFunction('normalizeSmsBowerCountryLabel')}
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('formatPriceTiersForPreview')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractOptionalFunction('collectSmsBowerPriceEntriesForPreview')}
${extractOptionalFunction('buildSmsBowerPricePreviewLines')}
${extractFunction('previewHeroSmsPriceTiers')}
return {
  displayHeroSmsPriceTiers,
  rowHeroSmsPriceTiers,
  get priceState() { return priceState; },
  get priceCountryConfig() { return priceCountryConfig; },
  previewHeroSmsPriceTiers,
};
`)(createTestSelect);

  await api.previewHeroSmsPriceTiers();

  assert.equal(api.priceState.providerId, 'smsbower');
  assert.equal(api.priceState.state.smsBowerApiKey, 'demo-key');
  assert.equal(api.priceState.state.smsBowerServiceCode, 'zztest_service');
  assert.deepStrictEqual(api.priceState.state.smsBowerCountryOrder, [7]);
  assert.equal(api.priceState.state.smsBowerMaxPrice, '0.5');
  assert.equal(api.priceCountryConfig.id, 7);
  assert.match(api.displayHeroSmsPriceTiers.textContent, /SMSBower:/);
  assert.match(api.displayHeroSmsPriceTiers.textContent, /Kazakhstan: 最低 0\.1234/);
  assert.match(api.displayHeroSmsPriceTiers.textContent, /0\.1234\(x3\)/);
  assert.doesNotMatch(api.displayHeroSmsPriceTiers.textContent, /hero-key|service=dr|HeroSMS/);
});

test('previewPhoneSmsBalance queries SMSBower balance with the SMSBower API key', async () => {
  const api = new Function(`
let balanceState = null;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider(providerId) {
      return {
        fetchBalance: async (state) => {
          balanceState = { providerId, state };
          return { balance: 12.34, raw: 'ACCESS_BALANCE:12.34' };
        },
      };
    },
  },
};
let latestState = { phoneSmsProvider: 'smsbower', smsBowerServiceCode: 'zztest_service', smsBowerCountryOrder: [7] };
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
const inputHeroSmsApiKey = { value: 'hero-key' };
const inputSmsBowerApiKey = { value: 'demo-key' };
const inputSmsBowerServiceCode = { value: 'zztest_service' };
const inputHeroSmsMaxPrice = { value: '' };
const displayPhoneSmsBalance = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
function getSelectedPhoneSmsProvider() { return 'smsbower'; }
function getSelectedSmsBowerCountries() { return [{ id: 7, label: 'Kazakhstan' }]; }
async function fetch(url) { throw new Error('unexpected HeroSMS fetch ' + url); }
function describeHeroSmsPreviewPayload(payload) { return typeof payload === 'string' ? payload : JSON.stringify(payload); }
function summarizeHeroSmsPreviewError(payload, status) { return String(status || '') + describeHeroSmsPreviewPayload(payload); }
function normalizeHeroSmsFetchErrorMessage(error) { return error?.message || String(error); }
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractFunction('previewPhoneSmsBalance')}
return {
  displayPhoneSmsBalance,
  get balanceState() { return balanceState; },
  previewPhoneSmsBalance,
};
`)();

  await api.previewPhoneSmsBalance();

  assert.equal(api.balanceState.providerId, 'smsbower');
  assert.equal(api.balanceState.state.smsBowerApiKey, 'demo-key');
  assert.equal(api.balanceState.state.smsBowerServiceCode, 'zztest_service');
  assert.equal(api.displayPhoneSmsBalance.textContent, 'SMSBower 余额 12.34');
});

test('previewPhoneSmsBalance requires SMSBower API key before fetching SMSBower balance', async () => {
  const api = new Function(`
let providerCalled = false;
const window = {
  PhoneSmsProviderRegistry: {
    createProvider() {
      providerCalled = true;
      return { fetchBalance: async () => ({ balance: 0 }) };
    },
  },
};
let latestState = { phoneSmsProvider: 'smsbower' };
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const PHONE_SMS_PROVIDER_SMSBOWER = 'smsbower';
const DEFAULT_SMS_BOWER_SERVICE_CODE = '';
const inputHeroSmsApiKey = { value: 'hero-key' };
const inputSmsBowerApiKey = { value: '' };
const inputSmsBowerServiceCode = { value: '' };
const inputHeroSmsMaxPrice = { value: '' };
const displayPhoneSmsBalance = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
function getSelectedPhoneSmsProvider() { return 'smsbower'; }
function getSelectedSmsBowerCountries() { return []; }
function describeHeroSmsPreviewPayload(payload) { return String(payload); }
function summarizeHeroSmsPreviewError(payload, status) { return String(status || '') + String(payload); }
function normalizeHeroSmsFetchErrorMessage(error) { return error?.message || String(error); }
${extractFunction('normalizeSmsBowerServiceCodeValue')}
${extractFunction('normalizeSmsBowerMaxPriceValue')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractOptionalFunction('sanitizePhoneSmsSidepanelError')}
${extractOptionalFunction('createSmsBowerSidepanelProvider')}
${extractOptionalFunction('buildSmsBowerSidepanelState')}
${extractFunction('previewPhoneSmsBalance')}
return {
  displayPhoneSmsBalance,
  get providerCalled() { return providerCalled; },
  previewPhoneSmsBalance,
};
`)();

  await api.previewPhoneSmsBalance();

  assert.equal(api.providerCalled, false);
  assert.match(api.displayPhoneSmsBalance.textContent, /SMSBower API Key/);
});

test('hero sms max price input does not auto-save partial typing states', () => {
  assert.match(
    sidepanelSource,
    /inputHeroSmsMaxPrice\?\.\s*addEventListener\('input',\s*\(\)\s*=>\s*\{\s*markSettingsDirty\(true\);\s*\}\);/
  );
  assert.doesNotMatch(
    sidepanelSource,
    /inputHeroSmsMaxPrice\?\.\s*addEventListener\('input',\s*\(\)\s*=>\s*\{\s*markSettingsDirty\(true\);\s*scheduleSettingsAutoSave\(\);/
  );
});
