import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVariables, resolve } from '../src/server/variables.js';

test('extractVariables bat ca hai cu phap', () => {
  assert.deepEqual(
    extractVariables('/query/abc-information/:msisdn?from={{fromDate}}'),
    ['fromDate', 'msisdn']
  );
});

test('extractVariables khong tra ve ten trung lap', () => {
  assert.deepEqual(extractVariables('{{a}}/{{a}}/:a'), ['a']);
});

test('extractVariables bo qua port trong URL', () => {
  assert.deepEqual(extractVariables('http://localhost:2345/api'), []);
});

test('resolve thay the bien curly', () => {
  const r = resolve('from={{fromDate}}&to={{toDate}}', { fromDate: '25032026', toDate: '01042026' });
  assert.equal(r.value, 'from=25032026&to=01042026');
  assert.deepEqual(r.missing, []);
});

test('resolve thay the bien colon', () => {
  const r = resolve('/query/abc-information/:msisdn', { msisdn: '0912345678' });
  assert.equal(r.value, '/query/abc-information/0912345678');
});

test('resolve thay the bien xuat hien nhieu lan', () => {
  const r = resolve('{{a}}-{{a}}', { a: 'x' });
  assert.equal(r.value, 'x-x');
});

test('resolve bao bien thieu va khong lam trung ten', () => {
  const r = resolve('{{a}}/:b/{{a}}', { });
  assert.deepEqual(r.missing.sort(), ['a', 'b']);
});

test('resolve coi chuoi rong la thieu', () => {
  const r = resolve('{{a}}', { a: '' });
  assert.deepEqual(r.missing, ['a']);
});

test('resolve giu nguyen port trong URL', () => {
  const r = resolve('http://localhost:2345/api', {});
  assert.equal(r.value, 'http://localhost:2345/api');
  assert.deepEqual(r.missing, []);
});

test('resolve ep kieu so ve chuoi', () => {
  const r = resolve('{{n}}', { n: 0 });
  assert.equal(r.value, '0');
  assert.deepEqual(r.missing, []);
});

test('extractVariables nhan dien placeholder sao', () => {
  assert.deepEqual(extractVariables('/query/white-list-ir-subscriber/{*}'), ['msisdn']);
});

test('extractVariables khong nhan doi msisdn khi co ca {*} va :msisdn', () => {
  assert.deepEqual(extractVariables('/x/{*}/:msisdn'), ['msisdn']);
});

test('resolve thay the placeholder sao bang msisdn', () => {
  const r = resolve('/query/white-list-ir-subscriber/{*}', { msisdn: '0912345678' });
  assert.equal(r.value, '/query/white-list-ir-subscriber/0912345678');
  assert.deepEqual(r.missing, []);
});

test('resolve bao thieu msisdn khi placeholder sao khong co gia tri', () => {
  const r = resolve('/x/{*}', {});
  assert.deepEqual(r.missing, ['msisdn']);
});

