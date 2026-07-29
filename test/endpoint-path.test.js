import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTemplate, parseInlineQuery, hasMsisdnPlaceholder } from '../public/js/shared/endpoint-path.js';

test('splitTemplate tach path va query rieng qua dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}?type=PREPAID&limit=10'),
    { path: '/query/abc-information', inlineQuery: 'type=PREPAID&limit=10' },
  );
});

test('splitTemplate bo dau gach cheo thua truoc dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}'),
    { path: '/query/abc-information', inlineQuery: '' },
  );
});

test('splitTemplate chap nhan dau sao khong co dau gach cheo', () => {
  assert.deepEqual(splitTemplate('/query/abc{*}'), { path: '/query/abc', inlineQuery: '' });
});

test('splitTemplate khong co dau sao thi tach o dau hoi', () => {
  assert.deepEqual(splitTemplate('/health?x=1'), { path: '/health', inlineQuery: 'x=1' });
});

test('splitTemplate khong co dau sao lan dau hoi', () => {
  assert.deepEqual(splitTemplate('/health'), { path: '/health', inlineQuery: '' });
});

test('splitTemplate xu ly gia tri rong', () => {
  assert.deepEqual(splitTemplate(''), { path: '', inlineQuery: '' });
  assert.deepEqual(splitTemplate(null), { path: '', inlineQuery: '' });
});

test('parseInlineQuery tra ve cap key value theo dung thu tu', () => {
  assert.deepEqual(
    parseInlineQuery('type=PREPAID&limit=10'),
    [{ key: 'type', value: 'PREPAID' }, { key: 'limit', value: '10' }],
  );
});

test('parseInlineQuery giu nguyen bien chua resolve', () => {
  assert.deepEqual(parseInlineQuery('from={{fromDate}}'), [{ key: 'from', value: '{{fromDate}}' }]);
});

test('parseInlineQuery cho key khong co gia tri', () => {
  assert.deepEqual(parseInlineQuery('debug'), [{ key: 'debug', value: '' }]);
});

test('parseInlineQuery bo qua doan rong', () => {
  assert.deepEqual(parseInlineQuery('&a=1&&'), [{ key: 'a', value: '1' }]);
  assert.deepEqual(parseInlineQuery(''), []);
});

test('hasMsisdnPlaceholder nhan dien cu phap cu', () => {
  assert.equal(hasMsisdnPlaceholder('/query/abc/:msisdn/detail'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{msisdn}}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{ msisdn }}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc'), false);
  assert.equal(hasMsisdnPlaceholder('/query/:accountId'), false);
});
