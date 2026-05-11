const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
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

test('sidepanel loads luckmail manager before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const luckmailManagerIndex = html.indexOf('<script src="luckmail-manager.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(luckmailManagerIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(luckmailManagerIndex < sidepanelIndex);
});

test('sidepanel html exposes compact LuckMail Step8 email wait seconds setting', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const domainIndex = html.indexOf('id="input-luckmail-domain"');
  const waitInputIndex = html.indexOf('id="input-luckmail-email-wait-seconds"');
  const projectIndex = html.indexOf('<span class="data-label">项目</span>');

  assert.notEqual(waitInputIndex, -1);
  assert.ok(waitInputIndex > domainIndex, 'wait setting should sit after the LuckMail domain setting');
  assert.ok(waitInputIndex < projectIndex, 'wait setting should stay with compact LuckMail settings before project display');
  assert.match(html, /<span class="data-label">等码时长<\/span>/);
  assert.match(html, /id="input-luckmail-email-wait-seconds"[^>]*value="300"[^>]*min="15"[^>]*max="1800"[^>]*step="15"/s);
  assert.match(html, /id="input-luckmail-email-wait-seconds"[^>]*title="Step8 LuckMail \/code 最大等码时长，300 秒约 5 分钟"/s);
  assert.match(html, /id="input-luckmail-email-wait-seconds"[\s\S]*<span class="data-unit">秒<\/span>/);
});

test('sidepanel html exposes compact LuckMail actual code polling interval setting', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const waitInputIndex = html.indexOf('id="input-luckmail-email-wait-seconds"');
  const intervalInputIndex = html.indexOf('id="input-luckmail-code-poll-interval-seconds"');
  const projectIndex = html.indexOf('<span class="data-label">项目</span>');

  assert.notEqual(intervalInputIndex, -1);
  assert.ok(intervalInputIndex > waitInputIndex, 'interval setting should sit after the LuckMail wait setting');
  assert.ok(intervalInputIndex < projectIndex, 'interval setting should stay with compact LuckMail settings before project display');
  assert.match(html, /<span class="data-label">轮询间隔<\/span>/);
  assert.match(html, /id="input-luckmail-code-poll-interval-seconds"[^>]*value="15"[^>]*min="5"[^>]*max="60"[^>]*step="1"/s);
  assert.match(html, /id="input-luckmail-code-poll-interval-seconds"[^>]*title="Step8 LuckMail \/code 实际轮询间隔，默认 15 秒"/s);
  assert.match(html, /id="input-luckmail-code-poll-interval-seconds"[\s\S]*<span class="data-unit">秒<\/span>/);
});

test('sidepanel source normalizes LuckMail email wait seconds to bounded seconds', () => {
  const api = new Function(`
const LUCKMAIL_EMAIL_WAIT_SECONDS_MIN = 15;
const LUCKMAIL_EMAIL_WAIT_SECONDS_MAX = 1800;
const DEFAULT_LUCKMAIL_EMAIL_WAIT_SECONDS = 300;
${extractFunction('normalizeLuckmailEmailWaitSecondsValue')}
return { normalizeLuckmailEmailWaitSecondsValue };
`)();

  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue(undefined), 300);
  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue('', 900), 900);
  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue('14'), 15);
  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue('15'), 15);
  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue('675.9'), 675);
  assert.equal(api.normalizeLuckmailEmailWaitSecondsValue('1801'), 1800);
});

test('sidepanel source normalizes LuckMail code polling interval seconds to bounded seconds', () => {
  const api = new Function(`
const LUCKMAIL_CODE_POLL_INTERVAL_SECONDS_MIN = 5;
const LUCKMAIL_CODE_POLL_INTERVAL_SECONDS_MAX = 60;
const DEFAULT_LUCKMAIL_CODE_POLL_INTERVAL_SECONDS = 15;
${extractFunction('normalizeLuckmailCodePollIntervalSecondsValue')}
return { normalizeLuckmailCodePollIntervalSecondsValue };
`)();

  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue(undefined), 15);
  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue('', 30), 30);
  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue('4'), 5);
  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue('5'), 5);
  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue('7.9'), 7);
  assert.equal(api.normalizeLuckmailCodePollIntervalSecondsValue('61'), 60);
});

test('sidepanel source persists restores and live-updates LuckMail email wait seconds', () => {
  assert.match(sidepanelSource, /const inputLuckmailEmailWaitSeconds = document\.getElementById\('input-luckmail-email-wait-seconds'\);/);
  assert.match(sidepanelSource, /const LUCKMAIL_EMAIL_WAIT_SECONDS_MIN = 15;/);
  assert.match(sidepanelSource, /const LUCKMAIL_EMAIL_WAIT_SECONDS_MAX = 1800;/);
  assert.match(sidepanelSource, /const DEFAULT_LUCKMAIL_EMAIL_WAIT_SECONDS = 300;/);
  assert.match(sidepanelSource, /const luckmailEmailWaitSecondsValue =[\s\S]*normalizeLuckmailEmailWaitSecondsValue\([\s\S]*inputLuckmailEmailWaitSeconds/);
  assert.match(sidepanelSource, /luckmailEmailWaitSeconds: luckmailEmailWaitSecondsValue,/);
  assert.match(sidepanelSource, /inputLuckmailEmailWaitSeconds\.value = String\([\s\S]*normalizeLuckmailEmailWaitSecondsValue\(state\?\.luckmailEmailWaitSeconds/);
  assert.match(sidepanelSource, /message\.payload\.luckmailEmailWaitSeconds !== undefined[\s\S]*inputLuckmailEmailWaitSeconds\.value = String\(/);
  assert.match(sidepanelSource, /typeof inputLuckmailEmailWaitSeconds !== 'undefined'[\s\S]*inputLuckmailEmailWaitSeconds\.addEventListener\('input'[\s\S]*markSettingsDirty\(true\);[\s\S]*scheduleSettingsAutoSave\(\);/);
  assert.match(sidepanelSource, /typeof inputLuckmailEmailWaitSeconds !== 'undefined'[\s\S]*inputLuckmailEmailWaitSeconds\.addEventListener\('blur'[\s\S]*normalizeLuckmailEmailWaitSecondsValue\(inputLuckmailEmailWaitSeconds\.value/);
});

test('sidepanel source persists restores and live-updates LuckMail code polling interval seconds', () => {
  assert.match(sidepanelSource, /const inputLuckmailCodePollIntervalSeconds = document\.getElementById\('input-luckmail-code-poll-interval-seconds'\);/);
  assert.match(sidepanelSource, /const LUCKMAIL_CODE_POLL_INTERVAL_SECONDS_MIN = 5;/);
  assert.match(sidepanelSource, /const LUCKMAIL_CODE_POLL_INTERVAL_SECONDS_MAX = 60;/);
  assert.match(sidepanelSource, /const DEFAULT_LUCKMAIL_CODE_POLL_INTERVAL_SECONDS = 15;/);
  assert.match(sidepanelSource, /const luckmailCodePollIntervalSecondsValue =[\s\S]*normalizeLuckmailCodePollIntervalSecondsValue\([\s\S]*inputLuckmailCodePollIntervalSeconds/);
  assert.match(sidepanelSource, /luckmailCodePollIntervalSeconds: luckmailCodePollIntervalSecondsValue,/);
  assert.match(sidepanelSource, /inputLuckmailCodePollIntervalSeconds\.value = String\([\s\S]*normalizeLuckmailCodePollIntervalSecondsValue\(state\?\.luckmailCodePollIntervalSeconds/);
  assert.match(sidepanelSource, /message\.payload\.luckmailCodePollIntervalSeconds !== undefined[\s\S]*inputLuckmailCodePollIntervalSeconds\.value = String\(/);
  assert.match(sidepanelSource, /typeof inputLuckmailCodePollIntervalSeconds !== 'undefined'[\s\S]*inputLuckmailCodePollIntervalSeconds\.addEventListener\('input'[\s\S]*markSettingsDirty\(true\);[\s\S]*scheduleSettingsAutoSave\(\);/);
  assert.match(sidepanelSource, /typeof inputLuckmailCodePollIntervalSeconds !== 'undefined'[\s\S]*inputLuckmailCodePollIntervalSeconds\.addEventListener\('blur'[\s\S]*normalizeLuckmailCodePollIntervalSecondsValue\(inputLuckmailCodePollIntervalSeconds\.value/);
});

test('luckmail manager exposes a factory and renders empty state', () => {
  const source = fs.readFileSync('sidepanel/luckmail-manager.js', 'utf8');
  const windowObject = {};

  const api = new Function('window', `${source}; return window.SidepanelLuckmailManager;`)(windowObject);

  assert.equal(typeof api?.createLuckmailManager, 'function');

  const manager = api.createLuckmailManager({
    dom: {
      btnLuckmailBulkDisable: { disabled: false },
      btnLuckmailBulkEnable: { disabled: false },
      btnLuckmailBulkPreserve: { disabled: false },
      btnLuckmailBulkUnpreserve: { disabled: false },
      btnLuckmailBulkUnused: { disabled: false },
      btnLuckmailBulkUsed: { disabled: false },
      btnLuckmailDisableUsed: { disabled: false, textContent: '' },
      btnLuckmailRefresh: { disabled: false },
      checkboxLuckmailSelectAll: { checked: false, indeterminate: false, disabled: false },
      inputEmail: { value: '' },
      inputLuckmailSearch: { value: '', disabled: false },
      luckmailList: { innerHTML: '' },
      luckmailSection: { style: { display: '' } },
      luckmailSelectionSummary: { textContent: '' },
      luckmailSummary: { textContent: '' },
      selectLuckmailFilter: { value: 'all', disabled: false },
    },
    helpers: {
      copyTextToClipboard: async () => {},
      escapeHtml: (value) => String(value || ''),
      formatLuckmailDateTime: (value) => String(value || ''),
      getLuckmailPreserveTagName: () => '保留',
      normalizeLuckmailProjectName: (value) => String(value || '').trim().toLowerCase(),
      openConfirmModal: async () => true,
      showToast() {},
    },
    runtime: {
      sendMessage: async () => ({ purchases: [] }),
    },
    constants: {
      copyIcon: '',
    },
  });

  assert.equal(typeof manager.renderLuckmailPurchases, 'function');
  assert.equal(typeof manager.refreshLuckmailPurchases, 'function');
  assert.equal(typeof manager.queueLuckmailPurchaseRefresh, 'function');
  assert.equal(typeof manager.reset, 'function');

  manager.renderLuckmailPurchases([]);
  manager.reset();
});
