# SMSBower Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SMSBower as a modular phone SMS provider for the Chrome MV3 extension.

**Architecture:** Keep all SMSBower API behavior in `phone-sms/providers/smsbower.js`, then wire the provider through the registry, background settings, phone verification routing, sidepanel settings UI, and tests. The adapter follows the existing `5sim` operational-provider pattern rather than adding SMSBower-specific API calls throughout the flow.

**Tech Stack:** Chrome MV3 service worker, plain JavaScript, `importScripts`, sidepanel HTML/JS, Node built-in test runner (`node --test`).

---

## Assumptions

- Provider ID: `smsbower`.
- Display label: `SMSBower`.
- The OpenAI/ChatGPT SMSBower service code remains configurable as `smsBowerServiceCode`; do not hardcode a guessed code.
- Tests must use fake API keys and fake `fetchImpl` only. Do not use real credentials or make live SMSBower calls.
- Existing `<all_urls>` host permissions cover the SMSBower API endpoint, so no manifest host-permission change is expected.

## File Map

- Create `phone-sms/providers/smsbower.js`: SMSBower adapter for balance, countries/services/prices, activation purchase, polling, completion, cancellation, and error normalization.
- Modify `phone-sms/providers/registry.js`: register and label `smsbower`.
- Modify `background.js`: import the provider before the registry, add persistent defaults/normalizers, and inject `createSmsBowerProvider` into phone helpers.
- Modify `background/phone-verification-flow.js`: add provider constants/order/routing and delegate SMSBower operations to the adapter.
- Modify `sidepanel/sidepanel.html`: load the provider script and expose SMSBower provider/settings controls.
- Modify `sidepanel/sidepanel.js`: wire DOM refs, save/load settings, labels/order, row visibility, and API key toggle behavior.
- Create `tests/smsbower-provider.test.js`: adapter and registry contract tests with fake fetches.
- Modify `tests/background-account-history-settings.test.js`: persistent settings/import ordering tests.
- Modify `tests/phone-verification-flow.test.js`: flow routing tests.
- Modify `tests/sidepanel-phone-verification-settings.test.js`: sidepanel markup/source tests.
- Modify `项目文件结构说明.md`: document the new provider file and updated responsibilities.

## Tasks

### Task 1: Adapter Contract

- [ ] Write failing `tests/smsbower-provider.test.js` modeled after `tests/five-sim-provider.test.js`.
- [ ] Verify red with `node --test tests/smsbower-provider.test.js`.
- [ ] Create `phone-sms/providers/smsbower.js` with a `PhoneSmsBowerProvider` IIFE/global module.
- [ ] Implement fake-fetch-tested methods: `requestActivation`, `pollActivationCode`, `finishActivation`, `cancelActivation`, `banActivation`, `fetchBalance`, `fetchCountries`, `fetchPrices`, and services list helper.
- [ ] Verify green with `node --test tests/smsbower-provider.test.js`.

### Task 2: Provider Registry

- [ ] Add registry tests proving `smsbower` normalization, label, and provider factory delegation.
- [ ] Verify red.
- [ ] Extend `phone-sms/providers/registry.js` with `PROVIDER_SMSBOWER`.
- [ ] Verify green.

### Task 3: Background Settings And Imports

- [ ] Add tests for SMSBower persistent setting normalization and import ordering.
- [ ] Verify red.
- [ ] Update `background.js` imports, defaults, normalization, provider order, and phone-helper dependency injection.
- [ ] Verify green with `node --test tests/background-account-history-settings.test.js`.

### Task 4: Flow Routing

- [ ] Add routing tests in `tests/phone-verification-flow.test.js` for request, poll, finish, cancel, and ban delegation.
- [ ] Verify red.
- [ ] Update `background/phone-verification-flow.js` to route SMSBower through the adapter without scattering API action strings.
- [ ] Verify green.

### Task 5: Sidepanel HTML Wiring

- [ ] Add HTML/source tests for provider script order, select options, order options, and SMSBower setting rows.
- [ ] Verify red.
- [ ] Update `sidepanel/sidepanel.html`.
- [ ] Verify green.

### Task 6: Sidepanel JS Settings And UI

- [ ] Add tests for constants, DOM refs, labels, payload keys, row visibility, provider order display, and API-key toggle wiring.
- [ ] Verify red.
- [ ] Update `sidepanel/sidepanel.js`.
- [ ] Verify green.

### Task 7: Integration Regression

- [ ] Run targeted tests:
  - `node --test tests/smsbower-provider.test.js`
  - `node --test tests/background-account-history-settings.test.js`
  - `node --test tests/phone-verification-flow.test.js`
  - `node --test tests/sidepanel-phone-verification-settings.test.js`
- [ ] Run `npm test`.
- [ ] Confirm no test uses the real SMSBower API key or performs a real network call.

### Task 8: Structure Documentation

- [ ] Update `项目文件结构说明.md` with `phone-sms/providers/smsbower.js` and touched module responsibilities.
- [ ] Re-run `npm test`.

## High-Risk Points

- Provider normalization is duplicated in registry, background, phone flow, and sidepanel; all must recognize `smsbower`.
- `smsBowerServiceCode` must be configurable and required.
- Query-string API keys must not be logged, printed, or included in thrown URLs.
- `STATUS_WAIT_RETRY` is a waiting state, not a usable code.
- `STATUS_CANCEL` is terminal.
- `setStatus&status=6` should be used only after successful code consumption; `status=8` is used for cancellation/used cleanup.
- HeroSMS free-reuse/reactivation behavior should not be assumed for SMSBower unless separately tested.
